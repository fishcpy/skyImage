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
	ID            uint           `gorm:"primaryKey" json:"id"`
	GroupID       *uint          `gorm:"index" json:"groupId"`
	Name          string         `gorm:"size:128;not null" json:"name"`
	Email         string         `gorm:"size:255;uniqueIndex;not null" json:"email"`
	PasswordHash  string         `gorm:"column:password;size:255;not null" json:"-"`
	IsSuperAdmin  bool           `gorm:"column:is_super_admin;default:false" json:"isSuperAdmin"`
	URL           string         `gorm:"size:255" json:"url"`
	Capacity      float64        `gorm:"default:0" json:"capacity"`
	UsedCapacity  float64        `gorm:"column:use_capacity;default:0" json:"usedCapacity"`
	Configs       datatypes.JSON `gorm:"type:json" json:"configs"`
	IsAdmin       bool           `gorm:"column:is_adminer;default:false" json:"isAdmin"`
	Status        uint8          `gorm:"default:1" json:"status"`
	EmailVerified *time.Time     `gorm:"column:email_verified_at" json:"emailVerifiedAt"`
	ImageCount    uint64         `gorm:"column:image_num;default:0" json:"imageCount"`
	AlbumCount    uint64         `gorm:"column:album_num;default:0" json:"albumCount"`
	RegisteredIP  string         `gorm:"column:registered_ip;size:64" json:"registeredIp"`
	RememberToken string         `gorm:"column:remember_token;size:255" json:"-"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	Group         Group          `gorm:"foreignKey:GroupID" json:"group"`
}

func (User) TableName() string {
	return "users"
}

type FileAsset struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"index" json:"userId"`
	GroupID         *uint     `gorm:"index" json:"groupId"`
	StrategyID      uint      `gorm:"index" json:"strategyId"`
	Key             string    `gorm:"size:64;uniqueIndex;not null" json:"key"`
	Path            string    `gorm:"size:512;not null" json:"path"`
	RelativePath    string    `gorm:"size:512;default:''" json:"relativePath"`
	Name            string    `gorm:"size:255;not null" json:"name"`
	OriginalName    string    `gorm:"size:255" json:"originalName"`
	Size            int64     `gorm:"not null" json:"size"`
	MimeType        string    `gorm:"size:64" json:"mimeType"`
	Extension       string    `gorm:"size:32" json:"extension"`
	ChecksumMD5     string    `gorm:"size:32" json:"checksumMd5"`
	ChecksumSHA1    string    `gorm:"size:40" json:"checksumSha1"`
	Width           int       `gorm:"default:0" json:"width"`
	Height          int       `gorm:"default:0" json:"height"`
	Visibility      string    `gorm:"size:16;default:'private'" json:"visibility"`
	StorageProvider string    `gorm:"size:32;default:'local'" json:"storageProvider"`
	UploadedIP      string    `gorm:"size:64" json:"uploadedIp"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
	User            User      `gorm:"foreignKey:UserID" json:"-"`
	Strategy        Strategy  `gorm:"foreignKey:StrategyID" json:"strategy"`
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
