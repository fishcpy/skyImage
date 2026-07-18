package shop

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"skyimage/internal/admin"
	"skyimage/internal/data"
	"skyimage/internal/payment"
)

var (
	ErrProductNotFound   = errors.New("product not found")
	ErrProductDisabled   = errors.New("product disabled")
	ErrOrderNotFound     = errors.New("order not found")
	ErrInvalidInput      = errors.New("invalid input")
	ErrPaymentDisabled   = errors.New("payment disabled")
	ErrProviderDisabled  = errors.New("payment provider disabled")
	ErrOrderNotPending   = errors.New("order is not pending")
	ErrAmountMismatch    = errors.New("payment amount mismatch")
	ErrAdminRequired     = errors.New("admin required")
)

type Service struct {
	db    *gorm.DB
	admin *admin.Service
}

func New(db *gorm.DB, adminService *admin.Service) *Service {
	return &Service{db: db, admin: adminService}
}

func (s *Service) SetDB(db *gorm.DB) {
	s.db = db
}

func (s *Service) SetAdmin(a *admin.Service) {
	s.admin = a
}

type ProductInput struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	PriceCents   int64  `json:"priceCents"`
	Currency     string `json:"currency"`
	DurationDays int    `json:"durationDays"`
	GroupID      uint   `json:"groupId"`
	Enabled      *bool  `json:"enabled"`
	Sort         *int   `json:"sort"`
}

func (s *Service) ListProducts(ctx context.Context, enabledOnly bool) ([]data.ShopProduct, error) {
	q := s.db.WithContext(ctx).Preload("Group").Order("sort ASC, id DESC")
	if enabledOnly {
		q = q.Where("enabled = ?", true)
	}
	var items []data.ShopProduct
	err := q.Find(&items).Error
	return items, err
}

func (s *Service) GetProduct(ctx context.Context, id uint) (data.ShopProduct, error) {
	var item data.ShopProduct
	err := s.db.WithContext(ctx).Preload("Group").First(&item, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return item, ErrProductNotFound
	}
	return item, err
}

func (s *Service) CreateProduct(ctx context.Context, input ProductInput) (data.ShopProduct, error) {
	if err := validateProductInput(input); err != nil {
		return data.ShopProduct{}, err
	}
	if err := s.ensureGroup(ctx, input.GroupID); err != nil {
		return data.ShopProduct{}, err
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	sort := 0
	if input.Sort != nil {
		sort = *input.Sort
	}
	currency := strings.ToUpper(strings.TrimSpace(input.Currency))
	if currency == "" {
		currency = "CNY"
	}
	item := data.ShopProduct{
		Name:         strings.TrimSpace(input.Name),
		Description:  strings.TrimSpace(input.Description),
		PriceCents:   input.PriceCents,
		Currency:     currency,
		DurationDays: input.DurationDays,
		GroupID:      input.GroupID,
		Enabled:      enabled,
		Sort:         sort,
	}
	if err := s.db.WithContext(ctx).Create(&item).Error; err != nil {
		return data.ShopProduct{}, err
	}
	return s.GetProduct(ctx, item.ID)
}

func (s *Service) UpdateProduct(ctx context.Context, id uint, input ProductInput) (data.ShopProduct, error) {
	item, err := s.GetProduct(ctx, id)
	if err != nil {
		return item, err
	}
	if err := validateProductInput(input); err != nil {
		return item, err
	}
	if err := s.ensureGroup(ctx, input.GroupID); err != nil {
		return item, err
	}
	currency := strings.ToUpper(strings.TrimSpace(input.Currency))
	if currency == "" {
		currency = item.Currency
	}
	updates := map[string]interface{}{
		"name":          strings.TrimSpace(input.Name),
		"description":   strings.TrimSpace(input.Description),
		"price_cents":   input.PriceCents,
		"currency":      currency,
		"duration_days": input.DurationDays,
		"group_id":      input.GroupID,
	}
	if input.Enabled != nil {
		updates["enabled"] = *input.Enabled
	}
	if input.Sort != nil {
		updates["sort"] = *input.Sort
	}
	if err := s.db.WithContext(ctx).Model(&data.ShopProduct{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return item, err
	}
	return s.GetProduct(ctx, id)
}

func (s *Service) DeleteProduct(ctx context.Context, id uint) error {
	res := s.db.WithContext(ctx).Delete(&data.ShopProduct{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrProductNotFound
	}
	return nil
}

func validateProductInput(input ProductInput) error {
	if strings.TrimSpace(input.Name) == "" {
		return fmt.Errorf("%w: name required", ErrInvalidInput)
	}
	if input.PriceCents <= 0 {
		return fmt.Errorf("%w: price must be > 0", ErrInvalidInput)
	}
	if input.DurationDays <= 0 {
		return fmt.Errorf("%w: durationDays must be > 0", ErrInvalidInput)
	}
	if input.GroupID == 0 {
		return fmt.Errorf("%w: groupId required", ErrInvalidInput)
	}
	return nil
}

func (s *Service) ensureGroup(ctx context.Context, id uint) error {
	var g data.Group
	if err := s.db.WithContext(ctx).First(&g, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("%w: group not found", ErrInvalidInput)
		}
		return err
	}
	return nil
}

type CreateOrderInput struct {
	ProductID uint   `json:"productId"`
	Provider  string `json:"provider"`
	EpayType  string `json:"epayType"`
	ReturnURL string `json:"returnUrl"`
	ClientIP  string `json:"-"`
	PublicBase string `json:"-"`
}

type CreateOrderResult struct {
	Order   data.ShopOrder         `json:"order"`
	PayURL  string                 `json:"payUrl,omitempty"`
	QR      string                 `json:"qrContent,omitempty"`
	Extra   map[string]string      `json:"extra,omitempty"`
	Checkout payment.CheckoutResult `json:"-"`
}

func (s *Service) settings(ctx context.Context) (payment.Settings, error) {
	raw, err := s.admin.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	return payment.Settings(raw), nil
}

func (s *Service) CreateOrder(ctx context.Context, user data.User, input CreateOrderInput) (CreateOrderResult, error) {
	settings, err := s.settings(ctx)
	if err != nil {
		return CreateOrderResult{}, err
	}
	if !settings.Bool("pay.enabled") {
		return CreateOrderResult{}, ErrPaymentDisabled
	}
	providerName := payment.NormalizeProvider(input.Provider)
	prov, err := payment.Get(providerName)
	if err != nil {
		return CreateOrderResult{}, err
	}
	if !prov.Enabled(settings) {
		return CreateOrderResult{}, ErrProviderDisabled
	}

	product, err := s.GetProduct(ctx, input.ProductID)
	if err != nil {
		return CreateOrderResult{}, err
	}
	if !product.Enabled {
		return CreateOrderResult{}, ErrProductDisabled
	}
	if product.PriceCents <= 0 {
		return CreateOrderResult{}, fmt.Errorf("%w: product price must be > 0", ErrInvalidInput)
	}

	orderNo, err := generateOrderNo()
	if err != nil {
		return CreateOrderResult{}, err
	}
	order := data.ShopOrder{
		OrderNo:      orderNo,
		UserID:       user.ID,
		ProductID:    product.ID,
		ProductName:  product.Name,
		PriceCents:   product.PriceCents,
		Currency:     product.Currency,
		DurationDays: product.DurationDays,
		GroupID:      product.GroupID,
		Status:       data.OrderStatusPending,
		Provider:     providerName,
	}
	if err := s.db.WithContext(ctx).Create(&order).Error; err != nil {
		return CreateOrderResult{}, err
	}

	base := strings.TrimRight(strings.TrimSpace(input.PublicBase), "/")
	notifyURL := base + "/api/pay/notify/" + providerName
	returnURL, err := sanitizeReturnURL(base, input.ReturnURL, orderNo)
	if err != nil {
		_ = s.db.WithContext(ctx).Model(&data.ShopOrder{}).Where("id = ?", order.ID).
			Updates(map[string]interface{}{"status": data.OrderStatusFailed}).Error
		return CreateOrderResult{}, err
	}

	checkout, err := prov.CreateCheckout(ctx, settings, payment.CheckoutRequest{
		OrderNo:     order.OrderNo,
		Subject:     product.Name,
		AmountCents: order.PriceCents,
		Currency:    order.Currency,
		ReturnURL:   returnURL,
		NotifyURL:   notifyURL,
		ClientIP:    input.ClientIP,
		EpayType:    input.EpayType,
	})
	if err != nil {
		_ = s.db.WithContext(ctx).Model(&data.ShopOrder{}).Where("id = ?", order.ID).
			Updates(map[string]interface{}{"status": data.OrderStatusFailed}).Error
		return CreateOrderResult{}, err
	}

	// reload with relations
	_ = s.db.WithContext(ctx).Preload("Group").First(&order, order.ID)
	return CreateOrderResult{
		Order:    order,
		PayURL:   checkout.PayURL,
		QR:       checkout.QRContent,
		Extra:    checkout.Extra,
		Checkout: checkout,
	}, nil
}

func (s *Service) ListUserOrders(ctx context.Context, userID uint, limit, offset int) ([]data.ShopOrder, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	var items []data.ShopOrder
	err := s.db.WithContext(ctx).
		Preload("Group").
		Where("user_id = ?", userID).
		Order("id DESC").
		Limit(limit).Offset(offset).
		Find(&items).Error
	return items, err
}

func (s *Service) GetUserOrder(ctx context.Context, userID uint, orderNo string) (data.ShopOrder, error) {
	var item data.ShopOrder
	err := s.db.WithContext(ctx).Preload("Group").
		Where("order_no = ? AND user_id = ?", orderNo, userID).
		First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return item, ErrOrderNotFound
	}
	return item, err
}

func (s *Service) ListAllOrders(ctx context.Context, status string, limit, offset int) ([]data.ShopOrder, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	q := s.db.WithContext(ctx).Preload("Group").Preload("User").Order("id DESC")
	if status = strings.TrimSpace(status); status != "" {
		q = q.Where("status = ?", status)
	}
	var items []data.ShopOrder
	err := q.Limit(limit).Offset(offset).Find(&items).Error
	return items, err
}

func (s *Service) GetOrderByNo(ctx context.Context, orderNo string) (data.ShopOrder, error) {
	var item data.ShopOrder
	err := s.db.WithContext(ctx).Where("order_no = ?", orderNo).First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return item, ErrOrderNotFound
	}
	return item, err
}

// FulfillFromNotify processes a verified notify result.
func (s *Service) FulfillFromNotify(ctx context.Context, providerName string, result payment.NotifyResult) error {
	_ = providerName
	if !result.Paid {
		return nil
	}
	if result.OrderNo == "" {
		return fmt.Errorf("missing order no")
	}
	order, err := s.GetOrderByNo(ctx, result.OrderNo)
	if err != nil {
		return err
	}
	// Always require a concrete paid amount that matches the order snapshot.
	if result.AmountCents <= 0 || result.AmountCents != order.PriceCents {
		return ErrAmountMismatch
	}
	if !result.AmountOK {
		return ErrAmountMismatch
	}
	if order.Status == data.OrderStatusPaid {
		return nil
	}
	if order.Status != data.OrderStatusPending {
		return ErrOrderNotPending
	}
	return s.fulfillOrder(ctx, order, result.TradeNo, result.Raw)
}

func (s *Service) fulfillOrder(ctx context.Context, order data.ShopOrder, tradeNo, notifyRaw string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var locked data.ShopOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", order.ID).First(&locked).Error; err != nil {
			return err
		}
		if locked.Status == data.OrderStatusPaid {
			return nil
		}
		if locked.Status != data.OrderStatusPending {
			return ErrOrderNotPending
		}

		var user data.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&user, locked.UserID).Error; err != nil {
			return err
		}
		// Expire stale membership before applying new purchase.
		if err := applyExpiryInTx(tx, &user); err != nil {
			return err
		}

		now := time.Now()
		expires, unitMicros, capturePrev, err := computeMembershipAfterPurchase(user, locked, now)
		if err != nil {
			return err
		}

		updates := map[string]interface{}{
			"group_id":                     locked.GroupID,
			"membership_expires_at":        expires,
			"membership_unit_price_micros": unitMicros,
			"membership_active_product_id": locked.ProductID,
		}
		// Only set previous group on first paid enrollment (preserve across renewals/upgrades).
		if capturePrev && user.MembershipPreviousGroupID == nil {
			if user.GroupID != nil {
				updates["membership_previous_group_id"] = *user.GroupID
			} else {
				updates["membership_previous_group_id"] = nil
			}
		}

		if err := tx.Model(&data.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
			return err
		}

		paidAt := now
		orderUpdates := map[string]interface{}{
			"status":                data.OrderStatusPaid,
			"provider_trade_no":     tradeNo,
			"paid_at":               paidAt,
			"fulfilled_at":          paidAt,
			"membership_expires_at": expires,
			"notify_raw":            truncate(notifyRaw, 8000),
		}
		res := tx.Model(&data.ShopOrder{}).
			Where("id = ? AND status = ?", locked.ID, data.OrderStatusPending).
			Updates(orderUpdates)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil
		}
		return nil
	})
}

// computeMembershipAfterPurchase returns new expiry, unit price, and whether to capture previous group.
func computeMembershipAfterPurchase(user data.User, order data.ShopOrder, now time.Time) (expires time.Time, unitMicros int64, capturePrev bool, err error) {
	if order.DurationDays <= 0 {
		return time.Time{}, 0, false, fmt.Errorf("%w: invalid duration", ErrInvalidInput)
	}
	newUnit := unitPriceMicros(order.PriceCents, order.DurationDays)
	purchaseDur := time.Duration(order.DurationDays) * 24 * time.Hour

	active := user.MembershipExpiresAt != nil && user.MembershipExpiresAt.After(now)
	if !active {
		return now.Add(purchaseDur), newUnit, true, nil
	}

	sameGroup := user.GroupID != nil && *user.GroupID == order.GroupID
	if sameGroup {
		base := *user.MembershipExpiresAt
		if base.Before(now) {
			base = now
		}
		return base.Add(purchaseDur), newUnit, false, nil
	}

	// switch group: convert remaining value to new-group days + purchase days
	remaining := user.MembershipExpiresAt.Sub(now)
	if remaining < 0 {
		remaining = 0
	}
	oldUnit := user.MembershipUnitPriceMicros
	if oldUnit <= 0 {
		oldUnit = newUnit
	}
	remainingDays := remaining.Hours() / 24
	creditDays := remainingDays * float64(oldUnit) / float64(newUnit)
	if creditDays < 0 {
		creditDays = 0
	}
	totalDays := creditDays + float64(order.DurationDays)
	secs := int64(math.Round(totalDays * 24 * 3600))
	minSecs := int64(order.DurationDays) * 24 * 3600
	if secs < minSecs {
		secs = minSecs
	}
	return now.Add(time.Duration(secs) * time.Second), newUnit, false, nil
}

func unitPriceMicros(priceCents int64, durationDays int) int64 {
	if durationDays <= 0 {
		return 0
	}
	return priceCents * 1_000_000 / int64(durationDays)
}

// EnsureMembershipFresh expires membership if needed (lazy check).
func (s *Service) EnsureMembershipFresh(ctx context.Context, user *data.User) error {
	if user == nil {
		return nil
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u data.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, user.ID).Error; err != nil {
			return err
		}
		if err := applyExpiryInTx(tx, &u); err != nil {
			return err
		}
		*user = u
		return nil
	})
}

// ExpireDueMemberships processes a batch of expired memberships.
func (s *Service) ExpireDueMemberships(ctx context.Context, limit int) (int, error) {
	if limit <= 0 {
		limit = 100
	}
	now := time.Now()
	var users []data.User
	if err := s.db.WithContext(ctx).
		Where("membership_expires_at IS NOT NULL AND membership_expires_at < ?", now).
		Limit(limit).
		Find(&users).Error; err != nil {
		return 0, err
	}
	n := 0
	for i := range users {
		err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			var u data.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, users[i].ID).Error; err != nil {
				return err
			}
			return applyExpiryInTx(tx, &u)
		})
		if err == nil {
			n++
		}
	}
	return n, nil
}

func applyExpiryInTx(tx *gorm.DB, user *data.User) error {
	if user.MembershipExpiresAt == nil {
		return nil
	}
	if user.MembershipExpiresAt.After(time.Now()) {
		return nil
	}
	// restore previous group
	var restore interface{}
	if user.MembershipPreviousGroupID != nil {
		restore = *user.MembershipPreviousGroupID
	} else {
		// fallback default group
		var g data.Group
		if err := tx.Where("is_default = ?", true).First(&g).Error; err == nil {
			restore = g.ID
		} else {
			restore = nil
		}
	}
	updates := map[string]interface{}{
		"group_id":                     restore,
		"membership_expires_at":        nil,
		"membership_previous_group_id": nil,
		"membership_unit_price_micros": 0,
		"membership_active_product_id": nil,
	}
	if err := tx.Model(&data.User{}).Where("id = ?", user.ID).Updates(updates).Error; err != nil {
		return err
	}
	// refresh user struct
	return tx.Preload("Group").First(user, user.ID).Error
}

// MembershipInfo is returned to clients.
type MembershipInfo struct {
	Active      bool       `json:"active"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	GroupID     *uint      `json:"groupId,omitempty"`
	GroupName   string     `json:"groupName,omitempty"`
	PreviousGID *uint      `json:"previousGroupId,omitempty"`
}

func (s *Service) GetMembership(ctx context.Context, user data.User) (MembershipInfo, error) {
	_ = s.EnsureMembershipFresh(ctx, &user)
	info := MembershipInfo{
		PreviousGID: user.MembershipPreviousGroupID,
	}
	if user.MembershipExpiresAt != nil && user.MembershipExpiresAt.After(time.Now()) {
		info.Active = true
		info.ExpiresAt = user.MembershipExpiresAt
		info.GroupID = user.GroupID
		if user.Group.ID != 0 {
			info.GroupName = user.Group.Name
		} else if user.GroupID != nil {
			var g data.Group
			if err := s.db.WithContext(ctx).First(&g, *user.GroupID).Error; err == nil {
				info.GroupName = g.Name
			}
		}
	}
	return info, nil
}

func generateOrderNo() (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("S%d%s", time.Now().Unix(), hex.EncodeToString(b[:])), nil
}

// sanitizeReturnURL only allows same-origin return URLs under PublicBaseURL.
// Empty/invalid values fall back to /dashboard/orders.
func sanitizeReturnURL(publicBase, candidate, orderNo string) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(publicBase), "/")
	fallback := base + "/dashboard/orders?order_no=" + orderNo
	candidate = strings.TrimSpace(candidate)
	if candidate == "" || base == "" {
		return fallback, nil
	}
	// Relative path on our site.
	if strings.HasPrefix(candidate, "/") && !strings.HasPrefix(candidate, "//") {
		return base + candidate, nil
	}
	if !strings.HasPrefix(candidate, base+"/") && candidate != base {
		return "", fmt.Errorf("%w: returnUrl must be same origin", ErrInvalidInput)
	}
	return candidate, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
