package data

import (
	"time"

	"gorm.io/datatypes"
)

type UserNotification struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"userId"`
	Type      string         `gorm:"size:64;not null" json:"type"`
	Title     string         `gorm:"size:255;not null" json:"title"`
	Message   string         `gorm:"type:text" json:"message"`
	Metadata  datatypes.JSON `gorm:"type:json" json:"metadata"`
	ReadAt    *time.Time     `gorm:"index" json:"readAt"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	User      User           `gorm:"foreignKey:UserID" json:"-"`
}

func (UserNotification) TableName() string {
	return "user_notifications"
}
