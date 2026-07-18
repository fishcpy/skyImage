package tickets

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"skyimage/internal/data"
	"skyimage/internal/files"
	"skyimage/internal/notifications"
	"skyimage/internal/users"
)

const (
	ConfigAttachmentStrategyID = "tickets.attachment_strategy_id"
	ConfigEmailNotifyEnabled   = "tickets.email_notify_enabled"
	ConfigEmailNotifyMode      = "tickets.email_notify_mode" // all_admins | selected
	ConfigEmailNotifyAdminIDs  = "tickets.email_notify_admin_ids" // comma-separated user ids

	NotifyModeAllAdmins = "all_admins"
	NotifyModeSelected  = "selected"

	MaxAttachmentBytes = 10 * 1024 * 1024 // 10MB
	MaxAttachmentsMsg  = 5
	MaxSubjectLen      = 200
	MaxBodyLen         = 20000
	TicketPathPrefix   = "tickets/"
)

var (
	ErrAttachmentStrategyNotSet = errors.New("ticket attachment storage strategy is not configured")
	ErrTicketClosed             = errors.New("ticket is closed")
	ErrForbidden                = errors.New("forbidden")
	ErrInvalidStatus            = errors.New("invalid status")
	ErrInvalidPriority          = errors.New("invalid priority")
	ErrEmptySubject             = errors.New("subject is required")
	ErrEmptyBody                = errors.New("body is required")
	ErrSubjectTooLong           = errors.New("subject too long")
	ErrBodyTooLong              = errors.New("body too long")
	ErrAttachmentTooLarge = errors.New("attachment too large")
	ErrTooManyAttachments = errors.New("too many attachments")
)

type MailSender interface {
	SendTicketCreatedToAdmin(ctx context.Context, adminEmail, adminName string, ticket data.Ticket, userName string) error
	SendTicketReplyToUser(ctx context.Context, userEmail, userName string, ticket data.Ticket, staffName, replyBody string) error
	SendTicketReplyToAdmin(ctx context.Context, adminEmail, adminName string, ticket data.Ticket, userName, replyBody string) error
	SendTicketStatusToUser(ctx context.Context, userEmail, userName string, ticket data.Ticket) error
}

type Service struct {
	db            *gorm.DB
	files         *files.Service
	notifications *notifications.Service
	mail          MailSender
}

func New(db *gorm.DB, filesService *files.Service, notificationsService *notifications.Service) *Service {
	return &Service{db: db, files: filesService, notifications: notificationsService}
}

func (s *Service) SetDB(db *gorm.DB) {
	s.db = db
}

func (s *Service) SetFiles(filesService *files.Service) {
	s.files = filesService
}

func (s *Service) SetNotifications(notificationsService *notifications.Service) {
	s.notifications = notificationsService
}

func (s *Service) SetMail(mail MailSender) {
	s.mail = mail
}

type ListFilter struct {
	UserID   uint
	Status   string
	Priority string
	Limit    int
	Offset   int
}

type CreateInput struct {
	UserID   uint
	Subject  string
	Body     string
	Priority string
	IsStaff  bool
}

type ReplyInput struct {
	TicketID uint
	UserID   uint
	Body     string
	IsStaff  bool
}

type UpdateInput struct {
	Status   *string
	Priority *string
}

type AttachmentInput struct {
	TicketID  uint
	MessageID *uint
	UserID    uint
	Filename  string
	MimeType  string
	Data      []byte
}

type TicketDetail struct {
	Ticket      data.Ticket
	Messages    []data.TicketMessage
	Attachments []data.TicketAttachment
}

func NormalizeStatus(value string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case data.TicketStatusOpen, data.TicketStatusPending, data.TicketStatusResolved, data.TicketStatusClosed:
		return v, nil
	case "":
		return data.TicketStatusOpen, nil
	default:
		return "", ErrInvalidStatus
	}
}

func NormalizePriority(value string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case data.TicketPriorityLow, data.TicketPriorityNormal, data.TicketPriorityHigh, data.TicketPriorityUrgent:
		return v, nil
	case "":
		return data.TicketPriorityNormal, nil
	default:
		return "", ErrInvalidPriority
	}
}

func (s *Service) AttachmentStrategyID(ctx context.Context) (uint, error) {
	var entry data.ConfigEntry
	if err := s.db.WithContext(ctx).Where("key = ?", ConfigAttachmentStrategyID).First(&entry).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, nil
		}
		return 0, err
	}
	raw := strings.TrimSpace(entry.Value)
	if raw == "" || raw == "0" {
		return 0, nil
	}
	var id uint
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return 0, nil
		}
		id = id*10 + uint(ch-'0')
	}
	return id, nil
}

func (s *Service) List(ctx context.Context, filter ListFilter) ([]data.Ticket, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	q := s.db.WithContext(ctx).Model(&data.Ticket{}).Preload("User")
	if filter.UserID > 0 {
		q = q.Where("user_id = ?", filter.UserID)
	}
	if status, err := NormalizeStatus(filter.Status); err == nil && strings.TrimSpace(filter.Status) != "" {
		q = q.Where("status = ?", status)
	}
	if priority, err := NormalizePriority(filter.Priority); err == nil && strings.TrimSpace(filter.Priority) != "" {
		q = q.Where("priority = ?", priority)
	}
	var items []data.Ticket
	// Open/pending/resolved first; closed last; then by activity time.
	err := q.Order("CASE WHEN status = 'closed' THEN 1 ELSE 0 END ASC, updated_at DESC, id DESC").
		Limit(limit).
		Offset(offset).
		Find(&items).Error
	return items, err
}

func (s *Service) Get(ctx context.Context, id uint) (TicketDetail, error) {
	var detail TicketDetail
	if err := s.db.WithContext(ctx).Preload("User").First(&detail.Ticket, id).Error; err != nil {
		return detail, err
	}
	if err := s.db.WithContext(ctx).
		Preload("User").
		Where("ticket_id = ?", id).
		Order("created_at ASC, id ASC").
		Find(&detail.Messages).Error; err != nil {
		return detail, err
	}
	if err := s.db.WithContext(ctx).
		Where("ticket_id = ?", id).
		Order("created_at ASC, id ASC").
		Find(&detail.Attachments).Error; err != nil {
		return detail, err
	}
	return detail, nil
}

func (s *Service) Create(ctx context.Context, input CreateInput) (TicketDetail, error) {
	subject := strings.TrimSpace(input.Subject)
	body := strings.TrimSpace(input.Body)
	if subject == "" {
		return TicketDetail{}, ErrEmptySubject
	}
	if body == "" {
		return TicketDetail{}, ErrEmptyBody
	}
	if len([]rune(subject)) > MaxSubjectLen {
		return TicketDetail{}, ErrSubjectTooLong
	}
	if len([]rune(body)) > MaxBodyLen {
		return TicketDetail{}, ErrBodyTooLong
	}
	priority, err := NormalizePriority(input.Priority)
	if err != nil {
		return TicketDetail{}, err
	}
	now := time.Now()
	ticket := data.Ticket{
		TicketNo:    generateTicketNo(now),
		UserID:      input.UserID,
		Subject:     subject,
		Status:      data.TicketStatusOpen,
		Priority:    priority,
		LastReplyAt: &now,
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&ticket).Error; err != nil {
			return err
		}
		msg := data.TicketMessage{
			TicketID: ticket.ID,
			UserID:   input.UserID,
			Body:     body,
			IsStaff:  input.IsStaff,
		}
		return tx.Create(&msg).Error
	})
	if err != nil {
		return TicketDetail{}, err
	}
	if s.notifications != nil && !input.IsStaff {
		_ = s.notifications.NotifyAdminsTicketCreated(ctx, ticket)
	}
	if !input.IsStaff {
		s.emailAdminsTicketCreated(ctx, ticket)
	}
	return s.Get(ctx, ticket.ID)
}

func (s *Service) Reply(ctx context.Context, input ReplyInput) (data.TicketMessage, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" {
		return data.TicketMessage{}, ErrEmptyBody
	}
	if len([]rune(body)) > MaxBodyLen {
		return data.TicketMessage{}, ErrBodyTooLong
	}
	var ticket data.Ticket
	if err := s.db.WithContext(ctx).First(&ticket, input.TicketID).Error; err != nil {
		return data.TicketMessage{}, err
	}
	if ticket.Status == data.TicketStatusClosed {
		return data.TicketMessage{}, ErrTicketClosed
	}
	if !input.IsStaff && ticket.UserID != input.UserID {
		return data.TicketMessage{}, ErrForbidden
	}
	now := time.Now()
	msg := data.TicketMessage{
		TicketID: input.TicketID,
		UserID:   input.UserID,
		Body:     body,
		IsStaff:  input.IsStaff,
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&msg).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{
			"last_reply_at": now,
			"updated_at":    now,
		}
		if input.IsStaff && ticket.Status == data.TicketStatusOpen {
			updates["status"] = data.TicketStatusPending
		}
		return tx.Model(&data.Ticket{}).Where("id = ?", ticket.ID).Updates(updates).Error
	})
	if err != nil {
		return data.TicketMessage{}, err
	}
	if s.notifications != nil {
		if input.IsStaff {
			_ = s.notifications.NotifyTicketReply(ctx, ticket, true)
		} else {
			_ = s.notifications.NotifyAdminsTicketReply(ctx, ticket)
		}
	}
	if input.IsStaff {
		s.emailUserTicketReply(ctx, ticket, input.UserID, body)
	} else {
		s.emailAdminsTicketReply(ctx, ticket, input.UserID, body)
	}
	_ = s.db.WithContext(ctx).Preload("User").First(&msg, msg.ID)
	return msg, nil
}

func (s *Service) Update(ctx context.Context, id uint, input UpdateInput) (data.Ticket, error) {
	var ticket data.Ticket
	if err := s.db.WithContext(ctx).First(&ticket, id).Error; err != nil {
		return ticket, err
	}
	updates := map[string]interface{}{}
	prevStatus := ticket.Status
	if input.Status != nil {
		status, err := NormalizeStatus(*input.Status)
		if err != nil {
			return ticket, err
		}
		updates["status"] = status
		if status == data.TicketStatusClosed {
			now := time.Now()
			updates["closed_at"] = &now
		} else {
			updates["closed_at"] = nil
		}
		ticket.Status = status
	}
	if input.Priority != nil {
		priority, err := NormalizePriority(*input.Priority)
		if err != nil {
			return ticket, err
		}
		updates["priority"] = priority
		ticket.Priority = priority
	}
	if len(updates) == 0 {
		return ticket, nil
	}
	if err := s.db.WithContext(ctx).Model(&data.Ticket{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return ticket, err
	}
	if err := s.db.WithContext(ctx).Preload("User").First(&ticket, id).Error; err != nil {
		return ticket, err
	}
	if s.notifications != nil && input.Status != nil && prevStatus != ticket.Status {
		_ = s.notifications.NotifyTicketStatus(ctx, ticket)
	}
	if input.Status != nil && prevStatus != ticket.Status {
		s.emailUserTicketStatus(ctx, ticket)
	}
	return ticket, nil
}

func (s *Service) CloseByOwner(ctx context.Context, ticketID, userID uint) (data.Ticket, error) {
	var ticket data.Ticket
	if err := s.db.WithContext(ctx).First(&ticket, ticketID).Error; err != nil {
		return ticket, err
	}
	if ticket.UserID != userID {
		return ticket, ErrForbidden
	}
	status := data.TicketStatusClosed
	return s.Update(ctx, ticketID, UpdateInput{Status: &status})
}

func (s *Service) AddAttachment(ctx context.Context, input AttachmentInput) (data.TicketAttachment, error) {
	if s.files == nil {
		return data.TicketAttachment{}, fmt.Errorf("files service unavailable")
	}
	if len(input.Data) == 0 {
		return data.TicketAttachment{}, fmt.Errorf("empty attachment")
	}
	if len(input.Data) > MaxAttachmentBytes {
		return data.TicketAttachment{}, ErrAttachmentTooLarge
	}
	detectedMIME, err := DetectAllowedAttachmentMIME(input.Data, input.Filename)
	if err != nil {
		return data.TicketAttachment{}, err
	}
	strategyID, err := s.AttachmentStrategyID(ctx)
	if err != nil {
		return data.TicketAttachment{}, err
	}
	if strategyID == 0 {
		return data.TicketAttachment{}, ErrAttachmentStrategyNotSet
	}
	payload := input.Data
	mimeType := detectedMIME
	// Apply storage strategy image compression/format conversion when configured.
	if strings.HasPrefix(mimeType, "image/") && s.files != nil {
		if processed, newMIME, procErr := s.files.ProcessBytesWithStrategy(ctx, strategyID, payload, mimeType); procErr == nil && len(processed) > 0 {
			payload = processed
			if newMIME != "" {
				mimeType = newMIME
			}
		}
	}
	var ticket data.Ticket
	if err := s.db.WithContext(ctx).First(&ticket, input.TicketID).Error; err != nil {
		return data.TicketAttachment{}, err
	}
	if ticket.Status == data.TicketStatusClosed {
		return data.TicketAttachment{}, ErrTicketClosed
	}
	if input.MessageID != nil && *input.MessageID > 0 {
		var msg data.TicketMessage
		if err := s.db.WithContext(ctx).
			First(&msg, "id = ? AND ticket_id = ?", *input.MessageID, input.TicketID).Error; err != nil {
			return data.TicketAttachment{}, err
		}
		// Only message author may attach files to that message (prevents spoofing ownership).
		if msg.UserID != input.UserID {
			return data.TicketAttachment{}, ErrForbidden
		}
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&data.TicketAttachment{}).
		Where("ticket_id = ?", input.TicketID).
		Count(&count).Error; err != nil {
		return data.TicketAttachment{}, err
	}
	if count >= 20 {
		return data.TicketAttachment{}, ErrTooManyAttachments
	}

	ext := strings.ToLower(filepath.Ext(input.Filename))
	if newExt := files.GetExtensionForMimeType(mimeType); newExt != "" {
		ext = "." + newExt
	}
	if len(ext) > 16 {
		ext = ""
	}
	key := strings.ReplaceAll(uuid.NewString(), "-", "")
	rel := fmt.Sprintf("%s%d/%s%s", TicketPathPrefix, input.TicketID, key, ext)
	stored, err := s.files.StoreBytes(ctx, strategyID, rel, payload)
	if err != nil {
		return data.TicketAttachment{}, err
	}
	name := sanitizeAttachmentName(input.Filename)
	if name == "" {
		name = key + ext
	} else if ext != "" {
		// Keep display name but align extension if converted.
		base := strings.TrimSuffix(name, filepath.Ext(name))
		name = base + ext
	}
	att := data.TicketAttachment{
		TicketID:        input.TicketID,
		MessageID:       input.MessageID,
		UserID:          input.UserID,
		StrategyID:      stored.StrategyID,
		Key:             key,
		Path:            stored.Path,
		RelativePath:    filepath.ToSlash(rel),
		Name:            name,
		Size:            stored.Size,
		MimeType:        mimeType,
		StorageProvider: stored.StorageProvider,
	}
	if err := s.db.WithContext(ctx).Create(&att).Error; err != nil {
		_ = s.files.DeleteStoredObject(ctx, stored.StrategyID, stored.Path, rel, stored.StorageProvider)
		return data.TicketAttachment{}, err
	}
	return att, nil
}

func (s *Service) FindAttachmentByRelativePath(ctx context.Context, rel string) (data.TicketAttachment, error) {
	rel = strings.TrimSpace(strings.TrimPrefix(filepath.ToSlash(rel), "/"))
	var att data.TicketAttachment
	err := s.db.WithContext(ctx).
		Preload("Ticket").
		Where("relative_path = ?", rel).
		First(&att).Error
	return att, err
}

// CanAccessAttachment: only the uploader or an admin may open the file.
// Ticket owners cannot download another user's attachments.
func (s *Service) CanAccessAttachment(att data.TicketAttachment, viewer *data.User) bool {
	if viewer == nil || viewer.ID == 0 {
		return false
	}
	if viewer.IsAdmin || viewer.IsSuperAdmin {
		return true
	}
	return att.UserID == viewer.ID
}

// FilterAttachmentsForViewer returns attachments the viewer may know about.
func FilterAttachmentsForViewer(items []data.TicketAttachment, viewer *data.User) []data.TicketAttachment {
	if viewer == nil || viewer.ID == 0 {
		return nil
	}
	if viewer.IsAdmin || viewer.IsSuperAdmin {
		return items
	}
	out := make([]data.TicketAttachment, 0, len(items))
	for _, item := range items {
		if item.UserID == viewer.ID {
			out = append(out, item)
		}
	}
	return out
}

func (s *Service) AttachmentPublicURL(ctx context.Context, att data.TicketAttachment) string {
	if s.files == nil {
		return ""
	}
	return s.files.ConsolePublicURL(ctx, att.RelativePath)
}

func generateTicketNo(now time.Time) string {
	return fmt.Sprintf("T-%s-%s", now.Format("20060102"), strings.ToUpper(uuid.NewString()[:6]))
}

func sanitizeAttachmentName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' || r == '\x00' {
			return -1
		}
		if r < 32 {
			return -1
		}
		return r
	}, name)
	name = strings.TrimSpace(name)
	if len(name) > 180 {
		name = name[:180]
	}
	return name
}

// TruncateForEmail limits free-text for email templates.
func TruncateForEmail(text string, maxRunes int) string {
	text = strings.TrimSpace(text)
	if maxRunes <= 0 {
		maxRunes = 2000
	}
	runes := []rune(text)
	if len(runes) <= maxRunes {
		return text
	}
	return string(runes[:maxRunes]) + "…"
}

func (s *Service) emailNotifyEnabled(ctx context.Context) bool {
	var entry data.ConfigEntry
	if err := s.db.WithContext(ctx).Where("key = ?", ConfigEmailNotifyEnabled).First(&entry).Error; err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(entry.Value), "true")
}

func (s *Service) emailNotifyMode(ctx context.Context) string {
	var entry data.ConfigEntry
	if err := s.db.WithContext(ctx).Where("key = ?", ConfigEmailNotifyMode).First(&entry).Error; err != nil {
		return NotifyModeAllAdmins
	}
	mode := strings.ToLower(strings.TrimSpace(entry.Value))
	if mode == NotifyModeSelected {
		return NotifyModeSelected
	}
	return NotifyModeAllAdmins
}

func (s *Service) selectedAdminIDs(ctx context.Context) []uint {
	var entry data.ConfigEntry
	if err := s.db.WithContext(ctx).Where("key = ?", ConfigEmailNotifyAdminIDs).First(&entry).Error; err != nil {
		return nil
	}
	parts := strings.Split(entry.Value, ",")
	ids := make([]uint, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		var id uint
		for _, ch := range part {
			if ch < '0' || ch > '9' {
				id = 0
				break
			}
			id = id*10 + uint(ch-'0')
		}
		if id > 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

func (s *Service) listNotifyAdminUsers(ctx context.Context) ([]data.User, error) {
	q := s.db.WithContext(ctx).
		Model(&data.User{}).
		Where("is_adminer = ? OR is_super_admin = ?", true, true).
		Where("status = ?", 1)
	if s.emailNotifyMode(ctx) == NotifyModeSelected {
		ids := s.selectedAdminIDs(ctx)
		if len(ids) == 0 {
			return nil, nil
		}
		q = q.Where("id IN ?", ids)
	}
	var users []data.User
	err := q.Find(&users).Error
	return users, err
}

func (s *Service) emailAdminsTicketCreated(ctx context.Context, ticket data.Ticket) {
	if s.mail == nil || !s.emailNotifyEnabled(ctx) {
		return
	}
	admins, err := s.listNotifyAdminUsers(ctx)
	if err != nil {
		return
	}
	var owner data.User
	_ = s.db.WithContext(ctx).First(&owner, ticket.UserID)
	for _, admin := range admins {
		if admin.ID == ticket.UserID || strings.TrimSpace(admin.Email) == "" {
			continue
		}
		_ = s.mail.SendTicketCreatedToAdmin(ctx, admin.Email, users.TicketStaffDisplayName(admin), ticket, owner.Name)
	}
}

func (s *Service) emailAdminsTicketReply(ctx context.Context, ticket data.Ticket, replyUserID uint, replyBody string) {
	if s.mail == nil || !s.emailNotifyEnabled(ctx) {
		return
	}
	admins, err := s.listNotifyAdminUsers(ctx)
	if err != nil {
		return
	}
	var owner data.User
	_ = s.db.WithContext(ctx).First(&owner, ticket.UserID)
	userName := owner.Name
	if replyUserID != 0 {
		var replyUser data.User
		if err := s.db.WithContext(ctx).First(&replyUser, replyUserID).Error; err == nil && replyUser.Name != "" {
			userName = replyUser.Name
		}
	}
	for _, admin := range admins {
		if admin.ID == replyUserID || strings.TrimSpace(admin.Email) == "" {
			continue
		}
		_ = s.mail.SendTicketReplyToAdmin(ctx, admin.Email, users.TicketStaffDisplayName(admin), ticket, userName, TruncateForEmail(replyBody, 2000))
	}
}

func (s *Service) emailUserTicketReply(ctx context.Context, ticket data.Ticket, staffUserID uint, replyBody string) {
	if s.mail == nil || !s.emailNotifyEnabled(ctx) {
		return
	}
	var owner data.User
	if err := s.db.WithContext(ctx).First(&owner, ticket.UserID).Error; err != nil || strings.TrimSpace(owner.Email) == "" {
		return
	}
	staffName := "Staff"
	if staffUserID > 0 {
		var staff data.User
		if err := s.db.WithContext(ctx).First(&staff, staffUserID).Error; err == nil {
			staffName = users.TicketStaffDisplayName(staff)
		}
	}
	_ = s.mail.SendTicketReplyToUser(ctx, owner.Email, owner.Name, ticket, staffName, TruncateForEmail(replyBody, 2000))
}

func (s *Service) emailUserTicketStatus(ctx context.Context, ticket data.Ticket) {
	if s.mail == nil || !s.emailNotifyEnabled(ctx) {
		return
	}
	var owner data.User
	if err := s.db.WithContext(ctx).First(&owner, ticket.UserID).Error; err != nil || strings.TrimSpace(owner.Email) == "" {
		return
	}
	_ = s.mail.SendTicketStatusToUser(ctx, owner.Email, owner.Name, ticket)
}
