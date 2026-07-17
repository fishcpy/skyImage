package users

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"gorm.io/gorm"

	"skyimage/internal/data"
)

const (
	// 16-digit range: [10^15, 10^16)
	userIDMin uint64 = 1_000_000_000_000_000
	userIDMax uint64 = 9_999_999_999_999_999
	userIDSpan       = userIDMax - userIDMin + 1
	createUserMaxRetry = 8
)

var ErrGenerateUserID = errors.New("failed to generate unique user id")

// IsSixteenDigitUserID reports whether id is a 16-digit public user id.
func IsSixteenDigitUserID(id uint) bool {
	v := uint64(id)
	return v >= userIDMin && v <= userIDMax
}

// GenerateUserID returns a random 16-digit id that does not exist in users.
func GenerateUserID(db *gorm.DB) (uint, error) {
	if db == nil {
		return 0, errors.New("db is nil")
	}
	for attempt := 0; attempt < 32; attempt++ {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(userIDSpan)))
		if err != nil {
			return 0, fmt.Errorf("rand: %w", err)
		}
		id := uint(userIDMin + n.Uint64())
		var count int64
		if err := db.Model(&data.User{}).Where("id = ?", id).Count(&count).Error; err != nil {
			return 0, err
		}
		if count == 0 {
			return id, nil
		}
	}
	return 0, ErrGenerateUserID
}

// GenerateUserIDInTx is like GenerateUserID but uses the given transaction handle.
func GenerateUserIDInTx(tx *gorm.DB) (uint, error) {
	return GenerateUserID(tx)
}

// CreateUserWithGeneratedID assigns a 16-digit id and inserts the user.
// On primary-key collision it regenerates the id and retries.
// Email unique conflicts are returned as-is for the caller to map.
func CreateUserWithGeneratedID(db *gorm.DB, user *data.User) error {
	if db == nil {
		return errors.New("db is nil")
	}
	if user == nil {
		return errors.New("user is nil")
	}
	var lastErr error
	for attempt := 0; attempt < createUserMaxRetry; attempt++ {
		id, err := GenerateUserID(db)
		if err != nil {
			return err
		}
		user.ID = id
		if err := db.Create(user).Error; err != nil {
			if isPrimaryKeyConflict(err) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	if lastErr != nil {
		return fmt.Errorf("%w: %v", ErrGenerateUserID, lastErr)
	}
	return ErrGenerateUserID
}

func isPrimaryKeyConflict(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		msg := strings.ToLower(err.Error())
		// Prefer treating generic duplicate as possible PK; callers also handle email uniqueness.
		return strings.Contains(msg, "primary") ||
			strings.Contains(msg, "users.primary") ||
			strings.Contains(msg, "users_pkey") ||
			strings.Contains(msg, "for key 'primary'") ||
			strings.Contains(msg, "unique constraint failed: users.id") ||
			strings.Contains(msg, "duplicate key value violates unique constraint \"users_pkey\"")
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique constraint failed: users.id") ||
		strings.Contains(msg, "duplicate key value violates unique constraint \"users_pkey\"") ||
		strings.Contains(msg, "for key 'primary'") ||
		(strings.Contains(msg, "duplicate entry") && strings.Contains(msg, "primary"))
}

// IsEmailUniqueConflict reports whether err is likely an email uniqueness violation.
func IsEmailUniqueConflict(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "email") &&
		(strings.Contains(msg, "unique") ||
			strings.Contains(msg, "duplicate") ||
			strings.Contains(msg, "idx_users_email")) {
		return true
	}
	// SQLite often: UNIQUE constraint failed: users.email
	return strings.Contains(msg, "users.email")
}
