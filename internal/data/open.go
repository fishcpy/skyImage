package data

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"skyimage/internal/config"
)

// OpenDatabase connects to the configured database without running migrations.
func OpenDatabase(cfg config.Config) (*gorm.DB, error) {
	dialector, err := dialectorFor(cfg)
	if err != nil {
		return nil, err
	}
	db, err := gorm.Open(dialector, &gorm.Config{
		PrepareStmt: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	return db, nil
}

// DialectorType returns the normalized database type (sqlite/mysql/postgres).
func DialectorType(cfg config.Config) string {
	return normalizeDBType(cfg.DatabaseType)
}

func normalizeDBType(raw string) string {
	dbType := strings.ToLower(strings.TrimSpace(raw))
	switch dbType {
	case "postgresql":
		return "postgres"
	default:
		return dbType
	}
}

func dialectorFor(cfg config.Config) (gorm.Dialector, error) {
	dbType := normalizeDBType(cfg.DatabaseType)

	switch dbType {
	case "":
		// Installer bootstrap: in-memory SQLite so no on-disk DB is created yet.
		return sqlite.Open("file:installer?mode=memory&cache=shared"), nil
	case "mysql":
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseHost,
			cfg.DatabasePort,
			cfg.DatabaseName,
		)
		return mysql.Open(dsn), nil
	case "postgres":
		dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Shanghai",
			cfg.DatabaseHost,
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseName,
			cfg.DatabasePort,
		)
		return postgres.Open(dsn), nil
	case "sqlite":
		dbPath, err := SanitizeSQLitePath(cfg.DatabasePath)
		if err != nil {
			return nil, err
		}
		if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
			return nil, fmt.Errorf("create database dir: %w", err)
		}
		return sqlite.Open(dbPath), nil
	default:
		return nil, fmt.Errorf("unsupported database type: %s", dbType)
	}
}

// SanitizeSQLitePath normalizes a SQLite file path and restricts it under storage/.
// Absolute paths and path traversal are rejected.
func SanitizeSQLitePath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return filepath.Join("storage", "data", "skyImage.db"), nil
	}
	if filepath.IsAbs(raw) {
		return "", fmt.Errorf("sqlite path must be a relative path under storage/")
	}
	// Reject URI schemes and null bytes early.
	if strings.Contains(raw, "\x00") || strings.Contains(raw, "://") {
		return "", fmt.Errorf("invalid database path")
	}
	cleaned := filepath.Clean(raw)
	sep := string(filepath.Separator)
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+sep) {
		return "", fmt.Errorf("invalid database path")
	}
	// Only allow under storage/
	if cleaned != "storage" && !strings.HasPrefix(cleaned, "storage"+sep) {
		return "", fmt.Errorf("sqlite path must be under storage/")
	}
	// Require a file path, not the storage directory itself.
	if cleaned == "storage" {
		return "", fmt.Errorf("sqlite path must point to a file under storage/")
	}
	return cleaned, nil
}

// ValidateDatabaseConfig checks required fields for the selected database type.
func ValidateDatabaseConfig(cfg config.Config) error {
	dbType := normalizeDBType(cfg.DatabaseType)
	switch dbType {
	case "sqlite":
		_, err := SanitizeSQLitePath(cfg.DatabasePath)
		return err
	case "mysql", "postgres":
		if strings.TrimSpace(cfg.DatabaseHost) == "" ||
			strings.TrimSpace(cfg.DatabasePort) == "" ||
			strings.TrimSpace(cfg.DatabaseName) == "" ||
			strings.TrimSpace(cfg.DatabaseUser) == "" {
			return fmt.Errorf("database connection info incomplete")
		}
		return nil
	case "":
		return fmt.Errorf("database type is required")
	default:
		return fmt.Errorf("unsupported database type: %s", dbType)
	}
}
