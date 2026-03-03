package session

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"gorm.io/gorm"

	"skyimage/internal/data"
)

const CookieName = "skyimage_session"

type Manager struct {
	db  *gorm.DB
	ttl time.Duration
}

func NewManager(db *gorm.DB, ttl time.Duration) *Manager {
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	return &Manager{
		db:  db,
		ttl: ttl,
	}
}

func (m *Manager) SetDB(db *gorm.DB) {
	m.db = db
}

func (m *Manager) Create(userID uint) (string, error) {
	if m.db == nil {
		return "", gorm.ErrInvalidDB
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	id := hex.EncodeToString(token)

	now := time.Now().UTC()
	record := data.SessionEntry{
		ID:        id,
		UserID:    userID,
		ExpiresAt: now.Add(m.ttl),
	}
	if err := m.db.WithContext(context.Background()).Create(&record).Error; err != nil {
		return "", err
	}
	return id, nil
}

func (m *Manager) Resolve(sessionID string) (uint, bool) {
	if m.db == nil || sessionID == "" {
		return 0, false
	}
	now := time.Now().UTC()
	var entry data.SessionEntry
	if err := m.db.WithContext(context.Background()).
		Where("id = ?", sessionID).
		First(&entry).Error; err != nil {
		return 0, false
	}
	if now.After(entry.ExpiresAt) {
		_ = m.db.WithContext(context.Background()).
			Where("id = ?", sessionID).
			Delete(&data.SessionEntry{}).Error
		return 0, false
	}

	// Sliding session window on every valid request.
	nextExpiry := now.Add(m.ttl)
	if err := m.db.WithContext(context.Background()).
		Model(&data.SessionEntry{}).
		Where("id = ?", sessionID).
		Update("expires_at", nextExpiry).Error; err != nil {
		return 0, false
	}
	return entry.UserID, true
}

func (m *Manager) Delete(sessionID string) {
	if m.db == nil || sessionID == "" {
		return
	}
	_ = m.db.WithContext(context.Background()).
		Where("id = ?", sessionID).
		Delete(&data.SessionEntry{}).Error
}

func (m *Manager) TTL() time.Duration {
	return m.ttl
}
