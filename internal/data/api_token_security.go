package data

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"
)

const apiTokenPrefix = "sk_"
const apiTokenNeverExpireYear = 9999

// GenerateAPIToken creates a random API token that is shown to user once.
func GenerateAPIToken() (string, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return apiTokenPrefix + hex.EncodeToString(token), nil
}

// HashAPIToken returns a deterministic hash used for database storage.
func HashAPIToken(token string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(token)))
	return hex.EncodeToString(sum[:])
}

// IsLegacyPlainAPIToken returns true for old plain-text token format.
func IsLegacyPlainAPIToken(stored string) bool {
	return strings.Contains(strings.TrimSpace(stored), "|")
}

func NewNeverExpireTime() time.Time {
	return time.Date(apiTokenNeverExpireYear, 12, 31, 23, 59, 59, 0, time.UTC)
}

func IsNeverExpireTime(t time.Time) bool {
	if t.IsZero() {
		return true
	}
	return t.UTC().Year() >= apiTokenNeverExpireYear
}

func NormalizeApiTokenExpiry(t time.Time) time.Time {
	if IsNeverExpireTime(t) {
		return NewNeverExpireTime()
	}
	return t.UTC()
}
