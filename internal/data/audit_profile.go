package data

import (
	"time"

	"gorm.io/datatypes"
)

type AuditProfile struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:128;not null" json:"name"`
	Provider  string         `gorm:"size:64;not null" json:"provider"`
	Configs   datatypes.JSON `gorm:"type:json" json:"configs"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

func (AuditProfile) TableName() string {
	return "audit_profiles"
}
