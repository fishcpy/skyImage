package notifications

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

const (
	TypeImageDeleted = "image_deleted"

	ReasonAuditBlockDelete = "audit_block_delete"
	ReasonAuditErrorDelete = "audit_error_delete"
	ReasonAdminDelete      = "admin_delete"

	ConfigUserRetentionLimit      = "notifications.user_retention_limit"
	ConfigAdminImageDeleteReason  = "notifications.admin_image_delete_default_reason"
	ConfigSystemAutoDeleteReason  = "notifications.system_auto_delete_default_reason"
	DefaultUserRetentionLimit     = 50
	MinUserRetentionLimit         = 1
	MaxUserRetentionLimit         = 500
	DefaultAdminImageDeleteReason = "图片已被管理员删除"
	DefaultSystemAutoDeleteReason = "图片已被系统自动删除"
	defaultNotificationTitle      = "图片已被删除"
)

type Service struct {
	db *gorm.DB
}

type ImageDeletedMetadata struct {
	FileID           uint   `json:"fileId"`
	FileKey          string `json:"fileKey"`
	FileOriginalName string `json:"fileOriginalName"`
	ReasonType       string `json:"reasonType"`
	AuditMessage     string `json:"auditMessage,omitempty"`
	AdminReason      string `json:"adminReason,omitempty"`
}

func New(db *gorm.DB) *Service {
	return &Service{db: db}
}

func (s *Service) SetDB(db *gorm.DB) {
	s.db = db
}

func NormalizeRetentionLimitValue(value int) int {
	if value < MinUserRetentionLimit {
		return DefaultUserRetentionLimit
	}
	if value > MaxUserRetentionLimit {
		return MaxUserRetentionLimit
	}
	return value
}

func NormalizeRetentionLimit(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultUserRetentionLimit
	}
	var value int
	for _, ch := range raw {
		if ch < '0' || ch > '9' {
			return DefaultUserRetentionLimit
		}
		value = value*10 + int(ch-'0')
	}
	return NormalizeRetentionLimitValue(value)
}

func NormalizeAdminDeleteReason(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return DefaultAdminImageDeleteReason
	}
	return value
}

func (s *Service) RetentionLimit(ctx context.Context) int {
	settings, err := s.settingsMap(ctx)
	if err != nil {
		return DefaultUserRetentionLimit
	}
	return NormalizeRetentionLimit(settings[ConfigUserRetentionLimit])
}

func (s *Service) AdminDeleteDefaultReason(ctx context.Context) string {
	settings, err := s.settingsMap(ctx)
	if err != nil {
		return DefaultAdminImageDeleteReason
	}
	return NormalizeAdminDeleteReason(settings[ConfigAdminImageDeleteReason])
}

func NormalizeSystemAutoDeleteReason(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return DefaultSystemAutoDeleteReason
	}
	return value
}

func (s *Service) SystemAutoDeleteDefaultReason(ctx context.Context) string {
	settings, err := s.settingsMap(ctx)
	if err != nil {
		return DefaultSystemAutoDeleteReason
	}
	return NormalizeSystemAutoDeleteReason(settings[ConfigSystemAutoDeleteReason])
}

func (s *Service) CreateImageDeletedByAudit(ctx context.Context, file data.FileAsset, reasonType, auditMessage string) error {
	message := s.SystemAutoDeleteDefaultReason(ctx)
	metadata := ImageDeletedMetadata{
		FileID:           file.ID,
		FileKey:          file.Key,
		FileOriginalName: file.OriginalName,
		ReasonType:       reasonType,
	}
	if strings.TrimSpace(auditMessage) != "" {
		metadata.AuditMessage = strings.TrimSpace(auditMessage)
	}
	if reasonType == ReasonAuditErrorDelete && metadata.AuditMessage != "" {
		message += "：" + metadata.AuditMessage
	}
	return s.create(ctx, file.UserID, defaultNotificationTitle, message, metadata)
}

func (s *Service) CreateImageDeletedByAdmin(ctx context.Context, file data.FileAsset, reason string) error {
	adminReason := strings.TrimSpace(reason)
	if adminReason == "" {
		adminReason = s.AdminDeleteDefaultReason(ctx)
	}
	metadata := ImageDeletedMetadata{
		FileID:           file.ID,
		FileKey:          file.Key,
		FileOriginalName: file.OriginalName,
		ReasonType:       ReasonAdminDelete,
		AdminReason:      adminReason,
	}
	return s.create(ctx, file.UserID, defaultNotificationTitle, adminReason, metadata)
}

func (s *Service) List(ctx context.Context, userID uint, status string, limit, offset int) ([]data.UserNotification, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	query := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC, id DESC")
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "unread":
		query = query.Where("read_at IS NULL")
	case "read":
		query = query.Where("read_at IS NOT NULL")
	}
	var items []data.UserNotification
	err := query.Limit(limit).Offset(offset).Find(&items).Error
	return items, err
}

func (s *Service) MarkRead(ctx context.Context, userID, id uint, read bool) (data.UserNotification, error) {
	var notification data.UserNotification
	if err := s.db.WithContext(ctx).First(&notification, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return notification, err
	}
	updates := map[string]interface{}{}
	if read {
		now := time.Now()
		updates["read_at"] = &now
		notification.ReadAt = &now
	} else {
		updates["read_at"] = nil
		notification.ReadAt = nil
	}
	if err := s.db.WithContext(ctx).Model(&data.UserNotification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(updates).Error; err != nil {
		return notification, err
	}
	return notification, nil
}

func (s *Service) MarkAllRead(ctx context.Context, userID uint) (int64, error) {
	now := time.Now()
	result := s.db.WithContext(ctx).
		Model(&data.UserNotification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", &now)
	return result.RowsAffected, result.Error
}

func (s *Service) ClearAll(ctx context.Context, userID uint) (int64, error) {
	result := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Delete(&data.UserNotification{})
	return result.RowsAffected, result.Error
}

func (s *Service) create(ctx context.Context, userID uint, title, message string, metadata ImageDeletedMetadata) error {
	if userID == 0 {
		return nil
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		notification := data.UserNotification{
			UserID:   userID,
			Type:     TypeImageDeleted,
			Title:    strings.TrimSpace(title),
			Message:  strings.TrimSpace(message),
			Metadata: datatypes.JSON(metadataJSON),
		}
		if err := tx.Create(&notification).Error; err != nil {
			return err
		}
		return trimUserNotifications(ctx, tx, userID)
	})
}

func (s *Service) settingsMap(ctx context.Context) (map[string]string, error) {
	var entries []data.ConfigEntry
	if err := s.db.WithContext(ctx).Find(&entries).Error; err != nil {
		return nil, err
	}
	settings := make(map[string]string, len(entries))
	for _, entry := range entries {
		settings[entry.Key] = entry.Value
	}
	return settings, nil
}

func trimUserNotifications(ctx context.Context, tx *gorm.DB, userID uint) error {
	var entries []data.ConfigEntry
	if err := tx.WithContext(ctx).Where("key = ?", ConfigUserRetentionLimit).Find(&entries).Error; err != nil {
		return err
	}
	limit := DefaultUserRetentionLimit
	if len(entries) > 0 {
		limit = NormalizeRetentionLimit(entries[0].Value)
	}
	if limit <= 0 {
		return nil
	}
	var staleIDs []uint
	if err := tx.WithContext(ctx).
		Model(&data.UserNotification{}).
		Where("user_id = ?", userID).
		Order("created_at DESC, id DESC").
		Offset(limit).
		Pluck("id", &staleIDs).Error; err != nil {
		return err
	}
	if len(staleIDs) == 0 {
		return nil
	}
	return tx.WithContext(ctx).Delete(&data.UserNotification{}, staleIDs).Error
}
