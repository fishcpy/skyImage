package data

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strconv"

	"gorm.io/gorm"
)

const (
	userIDMin uint64 = 1_000_000_000_000_000
	userIDMax uint64 = 9_999_999_999_999_999
	userIDSpan       = userIDMax - userIDMin + 1
	// Temporary IDs used during remapping (outside 16-digit range).
	// Requires 64-bit uint (amd64/arm64); not supported on 32-bit builds.
	userIDTempBase uint64 = 9_000_000_000_000_000_000
)

const userIDMigrationKey = "migration.user_id_v2"

// MigrateUserIDsToSixteenDigits rewrites non-16-digit user primary keys and
// all known foreign-key references. Safe to call repeatedly (marker in configs).
func MigrateUserIDsToSixteenDigits(db *gorm.DB) error {
	if db == nil || !db.Migrator().HasTable(&User{}) {
		return nil
	}

	var marker ConfigEntry
	if err := db.Where("key = ?", userIDMigrationKey).First(&marker).Error; err == nil && marker.Value == "done" {
		return nil
	}

	var users []User
	if err := db.Order("id ASC").Find(&users).Error; err != nil {
		return err
	}
	if len(users) == 0 {
		return setUserIDMigrationDone(db)
	}

	used := make(map[uint64]struct{}, len(users)*2)
	for _, u := range users {
		used[uint64(u.ID)] = struct{}{}
	}

	type remap struct {
		oldID uint
		newID uint
	}
	var pending []remap
	for _, u := range users {
		if isSixteenDigit(uint64(u.ID)) {
			continue
		}
		newID, err := nextFreeSixteenDigit(used)
		if err != nil {
			return err
		}
		used[uint64(newID)] = struct{}{}
		pending = append(pending, remap{oldID: u.ID, newID: newID})
	}

	if len(pending) == 0 {
		return setUserIDMigrationDone(db)
	}

	return db.Transaction(func(tx *gorm.DB) error {
		// Phase 1: move old PKs to temporary IDs to avoid unique collisions.
		for i, item := range pending {
			tempID := uint(userIDTempBase + uint64(i) + 1)
			if err := rewriteUserID(tx, item.oldID, tempID); err != nil {
				return fmt.Errorf("temp remap %d -> %d: %w", item.oldID, tempID, err)
			}
			pending[i].oldID = tempID
		}
		// Phase 2: temp -> final 16-digit IDs.
		for _, item := range pending {
			if err := rewriteUserID(tx, item.oldID, item.newID); err != nil {
				return fmt.Errorf("final remap %d -> %d: %w", item.oldID, item.newID, err)
			}
		}
		return setUserIDMigrationDone(tx)
	})
}

func setUserIDMigrationDone(db *gorm.DB) error {
	if !db.Migrator().HasTable(&ConfigEntry{}) {
		return nil
	}
	_ = db.Where("key = ?", userIDMigrationKey).Delete(&ConfigEntry{})
	return db.Create(&ConfigEntry{Key: userIDMigrationKey, Value: "done"}).Error
}

func isSixteenDigit(id uint64) bool {
	return id >= userIDMin && id <= userIDMax
}

func nextFreeSixteenDigit(used map[uint64]struct{}) (uint, error) {
	for attempt := 0; attempt < 64; attempt++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(userIDSpan)))
		if err != nil {
			return 0, err
		}
		id := userIDMin + n.Uint64()
		if _, exists := used[id]; exists {
			continue
		}
		return uint(id), nil
	}
	// Fallback linear scan from a random start (unlikely).
	start, _ := rand.Int(rand.Reader, big.NewInt(int64(userIDSpan)))
	for i := uint64(0); i < userIDSpan; i++ {
		id := userIDMin + (start.Uint64()+i)%userIDSpan
		if _, exists := used[id]; !exists {
			return uint(id), nil
		}
	}
	return 0, fmt.Errorf("exhausted 16-digit user id space")
}

func rewriteUserID(tx *gorm.DB, oldID, newID uint) error {
	if oldID == newID {
		return nil
	}
	updates := []struct {
		table string
		col   string
	}{
		{"files", "user_id"},
		{"sessions", "user_id"},
		{"api_tokens", "user_id"},
		{"user_oauth_bindings", "user_id"},
		{"user_notifications", "user_id"},
		{"albums", "user_id"},
		{"oauth_states", "user_id"},
		{"redeem_code_usages", "user_id"},
		{"redeem_codes", "created_by"},
	}
	for _, u := range updates {
		if !tx.Migrator().HasTable(u.table) {
			continue
		}
		if err := tx.Table(u.table).Where(u.col+" = ?", oldID).Update(u.col, newID).Error; err != nil {
			return fmt.Errorf("%s.%s: %w", u.table, u.col, err)
		}
	}
	// Primary key updates are more reliable via raw SQL than GORM Model.Update.
	usersTable := quoteIdent(tx, "users")
	idCol := quoteIdent(tx, "id")
	if err := tx.Exec(
		fmt.Sprintf("UPDATE %s SET %s = ? WHERE %s = ?", usersTable, idCol, idCol),
		newID, oldID,
	).Error; err != nil {
		return fmt.Errorf("users.id: %w", err)
	}
	return nil
}

// ParseUserID parses a decimal user id string (supports full 16-digit values).
func ParseUserID(raw string) (uint, error) {
	v, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(v), nil
}
