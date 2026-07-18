package data

import (
	"time"

	"gorm.io/datatypes"
)

type Group struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:64;not null;unique" json:"name"`
	IsDefault bool           `gorm:"default:false" json:"isDefault"`
	IsGuest   bool           `gorm:"default:false" json:"isGuest"`
	Configs   datatypes.JSON `gorm:"type:json" json:"configs"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

func (Group) TableName() string {
	return "groups"
}

type User struct {
	// ID is a 16-digit public identifier assigned on create (not DB auto-increment).
	// Serialized as a JSON string so browsers keep full precision for large ids.
	ID            uint           `gorm:"primaryKey;autoIncrement:false" json:"id,string"`
	GroupID       *uint          `gorm:"index" json:"groupId"`
	Name          string         `gorm:"size:128;not null" json:"name"`
	Email         string         `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash  string         `gorm:"column:password;size:255;default:''" json:"-"`
	IsSuperAdmin  bool           `gorm:"column:is_super_admin;default:false" json:"isSuperAdmin"`
	URL            string         `gorm:"size:255" json:"url"`
	Capacity       float64        `gorm:"default:0" json:"capacity"`
	CapacityBonus  float64        `gorm:"column:capacity_bonus;default:0" json:"capacityBonus"` // 相对角色组容量的增减（字节）
	UsedCapacity   float64        `gorm:"column:use_capacity;default:0" json:"usedCapacity"`
	Configs        datatypes.JSON `gorm:"type:json" json:"configs"`
	IsAdmin       bool           `gorm:"column:is_adminer;default:false" json:"isAdmin"`
	Status        uint8          `gorm:"default:1" json:"status"`
	EmailVerified *time.Time     `gorm:"column:email_verified_at" json:"emailVerifiedAt"`
	ImageCount    uint64         `gorm:"column:image_num;default:0" json:"imageCount"`
	AlbumCount    uint64         `gorm:"column:album_num;default:0" json:"albumCount"`
	RegisteredIP  string         `gorm:"column:registered_ip;size:64" json:"registeredIp"`
	RememberToken string         `gorm:"column:remember_token;size:255" json:"-"`
	// Paid membership (shop). Empty/null means no active paid membership.
	MembershipExpiresAt         *time.Time `gorm:"index" json:"membershipExpiresAt,omitempty"`
	MembershipPreviousGroupID   *uint      `gorm:"index" json:"membershipPreviousGroupId,omitempty"`
	MembershipUnitPriceMicros   int64      `gorm:"default:0" json:"membershipUnitPriceMicros"` // price_cents*1e6/duration_days
	MembershipActiveProductID   *uint      `json:"membershipActiveProductId,omitempty"`
	CreatedAt                   time.Time  `json:"createdAt"`
	UpdatedAt                   time.Time  `json:"updatedAt"`
	Group                       Group      `gorm:"foreignKey:GroupID" json:"group"`
}

func (User) TableName() string {
	return "users"
}

// UserOAuthBinding links a local user to an external OAuth provider account.
type UserOAuthBinding struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"index;not null" json:"userId"`
	Provider       string    `gorm:"size:32;not null;uniqueIndex:idx_oauth_provider_uid" json:"provider"`
	ProviderUserID string    `gorm:"size:255;not null;uniqueIndex:idx_oauth_provider_uid" json:"providerUserId"`
	ProviderEmail  string    `gorm:"size:255" json:"providerEmail"`
	ProviderName   string    `gorm:"size:255" json:"providerName"`
	AvatarURL      string    `gorm:"size:512" json:"avatarUrl"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	User           User      `gorm:"foreignKey:UserID" json:"-"`
}

func (UserOAuthBinding) TableName() string {
	return "user_oauth_bindings"
}

// OAuthState stores short-lived OAuth CSRF/PKCE state (multi-instance safe).
type OAuthState struct {
	ID            string    `gorm:"primaryKey;size:64" json:"id"`
	Provider      string    `gorm:"size:32;not null" json:"provider"`
	Mode          string    `gorm:"size:16;not null" json:"mode"`
	UserID        uint      `gorm:"default:0" json:"userId"`
	CodeVerifier  string    `gorm:"size:128;default:''" json:"-"`
	ExpiresAt     time.Time `gorm:"index;not null" json:"expiresAt"`
	CreatedAt     time.Time `json:"createdAt"`
}

func (OAuthState) TableName() string {
	return "oauth_states"
}

type FileAsset struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	UserID          uint           `gorm:"index" json:"userId"`
	GroupID         *uint          `gorm:"index" json:"groupId"`
	StrategyID      uint           `gorm:"index" json:"strategyId"`
	Key             string         `gorm:"size:64;uniqueIndex;not null" json:"key"`
	Path            string         `gorm:"size:512;not null" json:"path"`
	RelativePath    string         `gorm:"size:512;default:''" json:"relativePath"`
	PublicURL       string         `gorm:"size:2048;default:''" json:"publicUrl"`
	Name            string         `gorm:"size:255;not null" json:"name"`
	OriginalName    string         `gorm:"size:255" json:"originalName"`
	Size            int64          `gorm:"not null" json:"size"`
	MimeType        string         `gorm:"size:64" json:"mimeType"`
	Extension       string         `gorm:"size:32" json:"extension"`
	ChecksumMD5     string         `gorm:"size:32" json:"checksumMd5"`
	ChecksumSHA1    string         `gorm:"size:40" json:"checksumSha1"`
	Width                     int            `gorm:"default:0" json:"width"`
	Height                    int            `gorm:"default:0" json:"height"`
	Visibility                string         `gorm:"size:16;default:'private'" json:"visibility"`
	StorageProvider           string         `gorm:"size:32;default:'local'" json:"storageProvider"`
	ThumbnailPath             string         `gorm:"size:512;default:''" json:"thumbnailPath"`
	ThumbnailRelativePath     string         `gorm:"size:512;default:''" json:"thumbnailRelativePath"`
	ThumbnailPublicURL        string         `gorm:"size:2048;default:''" json:"thumbnailPublicUrl"`
	ThumbnailStorageProvider  string         `gorm:"size:32;default:''" json:"thumbnailStorageProvider"`
	ThumbnailStrategyID       *uint          `gorm:"index" json:"thumbnailStrategyId"`
	AuditStatus               string         `gorm:"size:16;default:'none'" json:"auditStatus"`
	AuditResult               datatypes.JSON `gorm:"type:json" json:"auditResult"`
	AuditCheckedAt            *time.Time     `json:"auditCheckedAt"`
	AuditReviewedAt           *time.Time     `json:"auditReviewedAt"`
	UploadedIP                string         `gorm:"size:64" json:"uploadedIp"`
	CreatedAt                 time.Time      `json:"createdAt"`
	UpdatedAt                 time.Time      `json:"updatedAt"`
	User                      User           `gorm:"foreignKey:UserID" json:"-"`
	Strategy                  Strategy       `gorm:"foreignKey:StrategyID" json:"strategy"`
}

func (FileAsset) TableName() string {
	return "files"
}

type Strategy struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Key       uint8          `gorm:"column:key" json:"key"`
	Name      string         `gorm:"size:64;not null" json:"name"`
	Intro     string         `gorm:"size:255" json:"intro"`
	Configs   datatypes.JSON `gorm:"type:json" json:"configs"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	Files     []FileAsset    `gorm:"foreignKey:StrategyID" json:"-"`
	Groups    []Group        `gorm:"many2many:group_strategy;" json:"groups,omitempty"`
}

func (Strategy) TableName() string {
	return "strategies"
}

type GroupStrategy struct {
	GroupID    uint `gorm:"primaryKey"`
	StrategyID uint `gorm:"primaryKey"`
}

func (GroupStrategy) TableName() string {
	return "group_strategy"
}

type ConfigEntry struct {
	Key       string    `gorm:"primaryKey" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
	CreatedAt time.Time `json:"createdAt"`
}

func (ConfigEntry) TableName() string {
	return "configs"
}

type InstallerState struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	IsCompleted bool      `gorm:"index" json:"isCompleted"`
	Version     string    `gorm:"size:32" json:"version"`
	SiteName    string    `gorm:"size:128" json:"siteName"`
	CompletedAt time.Time `json:"completedAt"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (InstallerState) TableName() string {
	return "installer_states"
}

type SessionEntry struct {
	ID        string    `gorm:"primaryKey;size:64" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (SessionEntry) TableName() string {
	return "sessions"
}

type ApiToken struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	UserID     uint       `gorm:"index;not null" json:"userId"`
	Token      string     `gorm:"size:255;uniqueIndex;not null" json:"token"`
	ExpiresAt  time.Time  `gorm:"index;not null" json:"expiresAt"`
	LastUsedAt *time.Time `gorm:"index" json:"lastUsedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
	User       User       `gorm:"foreignKey:UserID" json:"-"`
}

func (ApiToken) TableName() string {
	return "api_tokens"
}

type Album struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	Intro     string    `gorm:"size:512" json:"intro"`
	ImageNum  uint64    `gorm:"column:image_num;default:0" json:"imageNum"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	User      User      `gorm:"foreignKey:UserID" json:"-"`
}

func (Album) TableName() string {
	return "albums"
}

// RedeemCode 兑换码（角色组 / 容量增减）
type RedeemCode struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	Code             string    `gorm:"size:64;uniqueIndex;not null" json:"code"`
	RewardType       string    `gorm:"size:16;default:'group'" json:"rewardType"` // group | capacity
	GroupID          *uint     `gorm:"index" json:"groupId"`
	CapacityDelta    float64   `gorm:"default:0" json:"capacityDelta"` // 容量增减（字节，可负）
	MaxUses          int       `gorm:"default:0" json:"maxUses"`       // 0 表示不限制
	UsedCount        int       `gorm:"default:0" json:"usedCount"`
	AllowMultiRedeem bool      `gorm:"default:false" json:"allowMultiRedeem"` // 同一用户是否可多次兑换
	Enabled          bool      `gorm:"default:true" json:"enabled"`
	Note             string    `gorm:"size:255" json:"note"`
	CreatedBy        uint      `gorm:"index;not null" json:"createdBy"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
	Group            *Group    `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	Creator          User      `gorm:"foreignKey:CreatedBy" json:"-"`
}

func (RedeemCode) TableName() string {
	return "redeem_codes"
}

// RedeemCodeUsage 兑换码使用记录
type RedeemCodeUsage struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	RedeemCodeID uint      `gorm:"index;not null" json:"redeemCodeId"`
	UserID       uint      `gorm:"index;not null" json:"userId"`
	CreatedAt    time.Time `json:"createdAt"`
	User         User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (RedeemCodeUsage) TableName() string {
	return "redeem_code_usages"
}

// ShopProduct is a purchasable membership package.
type ShopProduct struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:128;not null" json:"name"`
	Description  string    `gorm:"size:512" json:"description"`
	PriceCents   int64     `gorm:"not null;default:0" json:"priceCents"` // minor units (fen/cents)
	Currency     string    `gorm:"size:8;default:'CNY'" json:"currency"`
	DurationDays int       `gorm:"not null;default:30" json:"durationDays"`
	GroupID      uint      `gorm:"index;not null" json:"groupId"`
	Enabled      bool      `gorm:"default:true;index" json:"enabled"`
	Sort         int       `gorm:"default:0" json:"sort"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Group        Group     `gorm:"foreignKey:GroupID" json:"group,omitempty"`
}

func (ShopProduct) TableName() string {
	return "shop_products"
}

const (
	OrderStatusPending = "pending"
	OrderStatusPaid    = "paid"
	OrderStatusClosed  = "closed"
	OrderStatusFailed  = "failed"
)

const (
	PayProviderEpay   = "epay"
	PayProviderAlipay = "alipay"
	PayProviderWechat = "wechat"
	PayProviderStripe = "stripe"
)

// ShopOrder is a payment order for a shop product.
type ShopOrder struct {
	ID                    uint       `gorm:"primaryKey" json:"id"`
	OrderNo               string     `gorm:"size:64;uniqueIndex;not null" json:"orderNo"`
	UserID                uint       `gorm:"index;not null" json:"userId"`
	ProductID             uint       `gorm:"index;not null" json:"productId"`
	ProductName           string     `gorm:"size:128;not null" json:"productName"`
	PriceCents            int64      `gorm:"not null" json:"priceCents"`
	Currency              string     `gorm:"size:8;default:'CNY'" json:"currency"`
	DurationDays          int        `gorm:"not null" json:"durationDays"`
	GroupID               uint       `gorm:"index;not null" json:"groupId"`
	Status                string     `gorm:"size:16;index;default:'pending'" json:"status"`
	Provider              string     `gorm:"size:16;index;not null" json:"provider"`
	ProviderTradeNo       string     `gorm:"size:128;default:''" json:"providerTradeNo"`
	PaidAt                *time.Time `json:"paidAt,omitempty"`
	FulfilledAt           *time.Time `json:"fulfilledAt,omitempty"`
	MembershipExpiresAt   *time.Time `json:"membershipExpiresAt,omitempty"`
	NotifyRaw             string     `gorm:"type:text" json:"-"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
	User                  User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Product               ShopProduct `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	Group                 Group      `gorm:"foreignKey:GroupID" json:"group,omitempty"`
}

func (ShopOrder) TableName() string {
	return "shop_orders"
}

const (
	TicketStatusOpen     = "open"
	TicketStatusPending  = "pending"
	TicketStatusResolved = "resolved"
	TicketStatusClosed   = "closed"

	TicketPriorityLow    = "low"
	TicketPriorityNormal = "normal"
	TicketPriorityHigh   = "high"
	TicketPriorityUrgent = "urgent"
)

// Ticket is a support ticket created by a user.
type Ticket struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	TicketNo    string     `gorm:"size:32;uniqueIndex;not null" json:"ticketNo"`
	UserID      uint       `gorm:"index;not null" json:"userId"`
	Subject     string     `gorm:"size:255;not null" json:"subject"`
	Status      string     `gorm:"size:16;index;default:'open'" json:"status"`
	Priority    string     `gorm:"size:16;index;default:'normal'" json:"priority"`
	LastReplyAt *time.Time `json:"lastReplyAt,omitempty"`
	ClosedAt    *time.Time `json:"closedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	User        User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (Ticket) TableName() string {
	return "tickets"
}

// TicketMessage is a reply on a ticket (Markdown body).
type TicketMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	TicketID  uint      `gorm:"index;not null" json:"ticketId"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Body      string    `gorm:"type:text;not null" json:"body"`
	IsStaff   bool      `gorm:"default:false" json:"isStaff"`
	CreatedAt time.Time `json:"createdAt"`
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (TicketMessage) TableName() string {
	return "ticket_messages"
}

// TicketAttachment is a private attachment served only via console domain.
type TicketAttachment struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	TicketID        uint      `gorm:"index;not null" json:"ticketId"`
	MessageID       *uint     `gorm:"index" json:"messageId,omitempty"`
	UserID          uint      `gorm:"index;not null" json:"userId"`
	StrategyID      uint      `gorm:"index;not null" json:"strategyId"`
	Key             string    `gorm:"size:64;uniqueIndex;not null" json:"key"`
	Path            string    `gorm:"size:512;not null" json:"path"`
	RelativePath    string    `gorm:"size:512;index;not null" json:"relativePath"`
	Name            string    `gorm:"size:255;not null" json:"name"`
	Size            int64     `gorm:"not null" json:"size"`
	MimeType        string    `gorm:"size:128" json:"mimeType"`
	StorageProvider string    `gorm:"size:32;default:'local'" json:"storageProvider"`
	CreatedAt       time.Time `json:"createdAt"`
	User            User      `gorm:"foreignKey:UserID" json:"-"`
	Ticket          Ticket    `gorm:"foreignKey:TicketID" json:"-"`
}

func (TicketAttachment) TableName() string {
	return "ticket_attachments"
}
