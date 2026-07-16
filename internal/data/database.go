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

// NewDatabase connects to the configured database and runs auto migrations.
func NewDatabase(cfg config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector

	dbType := strings.ToLower(strings.TrimSpace(cfg.DatabaseType))

	switch dbType {
	case "":
		// 安装阶段，使用内存数据库避免提前创建实际数据库文件
		dialector = sqlite.Open("file:installer?mode=memory&cache=shared")
	case "mysql":
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseHost,
			cfg.DatabasePort,
			cfg.DatabaseName,
		)
		dialector = mysql.Open(dsn)
	case "postgres", "postgresql":
		dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable TimeZone=Asia/Shanghai",
			cfg.DatabaseHost,
			cfg.DatabaseUser,
			cfg.DatabasePassword,
			cfg.DatabaseName,
			cfg.DatabasePort,
		)
		dialector = postgres.Open(dsn)
	case "sqlite":
		dbPath := cfg.DatabasePath
		if dbPath == "" {
			dbPath = filepath.Join("storage", "data", "skyImage.db")
		}
		dbPath = filepath.Clean(dbPath)
		if strings.Contains(dbPath, "..") {
			return nil, fmt.Errorf("invalid database path")
		}
		if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
			return nil, fmt.Errorf("create database dir: %w", err)
		}
		dialector = sqlite.Open(dbPath)
	default:
		return nil, fmt.Errorf("unsupported database type: %s", dbType)
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		PrepareStmt: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := ensureRelativePathColumn(db); err != nil {
		return nil, fmt.Errorf("prepare files table: %w", err)
	}
	if err := ensurePublicURLColumn(db); err != nil {
		return nil, fmt.Errorf("prepare files table: %w", err)
	}
	if err := ensureLastUsedAtColumn(db); err != nil {
		return nil, fmt.Errorf("prepare api_tokens table: %w", err)
	}
	if err := ensureAPITokenHashes(db); err != nil {
		return nil, fmt.Errorf("migrate api token hashes: %w", err)
	}

	if err := migrateTurnstileToCaptcha(db); err != nil {
		return nil, fmt.Errorf("migrate turnstile to captcha: %w", err)
	}

	if err := db.AutoMigrate(
		&Group{},
		&User{},
		&UserNotification{},
		&FileAsset{},
		&ConfigEntry{},
		&AuditProfile{},
		&Strategy{},
		&GroupStrategy{},
		&InstallerState{},
		&SessionEntry{},
		&ApiToken{},
		&Album{},
		&RedeemCode{},
		&RedeemCodeUsage{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}

	return db, nil
}

func MustDatabase(cfg config.Config) *gorm.DB {
	db, err := NewDatabase(cfg)
	if err != nil {
		panic(err)
	}
	return db
}

func ensureRelativePathColumn(db *gorm.DB) error {
	if !db.Migrator().HasTable(&FileAsset{}) {
		return nil
	}
	if db.Migrator().HasColumn(&FileAsset{}, "relative_path") {
		return nil
	}
	if err := db.Exec("ALTER TABLE `files` ADD COLUMN `relative_path` TEXT DEFAULT ''").Error; err != nil {
		return err
	}
	return db.Exec("UPDATE `files` SET `relative_path` = '' WHERE `relative_path` IS NULL").Error
}

func ensurePublicURLColumn(db *gorm.DB) error {
	if !db.Migrator().HasTable(&FileAsset{}) {
		return nil
	}
	if db.Migrator().HasColumn(&FileAsset{}, "public_url") {
		return nil
	}
	if err := db.Exec("ALTER TABLE `files` ADD COLUMN `public_url` TEXT DEFAULT ''").Error; err != nil {
		return err
	}
	return db.Exec("UPDATE `files` SET `public_url` = '' WHERE `public_url` IS NULL").Error
}

func ensureLastUsedAtColumn(db *gorm.DB) error {
	if !db.Migrator().HasTable(&ApiToken{}) {
		return nil
	}
	if db.Migrator().HasColumn(&ApiToken{}, "last_used_at") {
		return nil
	}
	return db.Exec("ALTER TABLE `api_tokens` ADD COLUMN `last_used_at` DATETIME").Error
}

func ensureAPITokenHashes(db *gorm.DB) error {
	if !db.Migrator().HasTable(&ApiToken{}) {
		return nil
	}
	type row struct {
		ID    uint
		Token string
	}
	var rows []row
	if err := db.Table("api_tokens").Select("id, token").Find(&rows).Error; err != nil {
		return err
	}
	for _, item := range rows {
		if !IsLegacyPlainAPIToken(item.Token) {
			continue
		}
		hashed := HashAPIToken(item.Token)
		if err := db.Table("api_tokens").
			Where("id = ? AND token = ?", item.ID, item.Token).
			Update("token", hashed).Error; err != nil {
			return err
		}
	}
	return nil
}

// migrateTurnstileToCaptcha migrates old turnstile.* config keys to the new captcha.* keys.
// This is needed for upgrades from v0.1.9 and earlier where Cloudflare Turnstile settings
// were stored under "turnstile.*" keys. The new unified captcha system uses "captcha.cloudflare.*"
// and "captcha.*" keys instead.
func migrateTurnstileToCaptcha(db *gorm.DB) error {
	if !db.Migrator().HasTable(&ConfigEntry{}) {
		return nil
	}

	// Check if migration is needed: old key exists and new key doesn't
	var oldCount int64
	db.Model(&ConfigEntry{}).Where("key = ?", "turnstile.site_key").Count(&oldCount)
	if oldCount == 0 {
		return nil // No old settings, nothing to migrate
	}

	var newCount int64
	db.Model(&ConfigEntry{}).Where("key = ?", "captcha.cloudflare.site_key").Count(&newCount)
	if newCount > 0 {
		return nil // New settings already exist, skip migration
	}

	// Migrate key mappings: old key -> new key
	migrations := map[string]string{
		"turnstile.site_key":                "captcha.cloudflare.site_key",
		"turnstile.secret_key":              "captcha.cloudflare.secret_key",
		"turnstile.last_verified_signature": "captcha.cloudflare.last_verified_signature",
		"turnstile.last_verified_at":        "captcha.cloudflare.last_verified_at",
		"turnstile.login":                   "captcha.login",
		"turnstile.register":                "captcha.register",
		"turnstile.register_verify":         "captcha.register_verify",
	}

	for oldKey, newKey := range migrations {
		var entry ConfigEntry
		if err := db.Where("key = ?", oldKey).First(&entry).Error; err != nil {
			continue // Key doesn't exist, skip
		}
		// Create new entry
		db.Where("key = ?", newKey).Delete(&ConfigEntry{})
		db.Create(&ConfigEntry{Key: newKey, Value: entry.Value})
	}

	// Migrate turnstile.enabled -> captcha.enabled + set provider to cloudflare
	var enabledEntry ConfigEntry
	if err := db.Where("key = ?", "turnstile.enabled").First(&enabledEntry).Error; err == nil {
		db.Where("key = ?", "captcha.enabled").Delete(&ConfigEntry{})
		db.Create(&ConfigEntry{Key: "captcha.enabled", Value: enabledEntry.Value})
		// If turnstile was enabled, set provider to cloudflare
		if enabledEntry.Value == "true" {
			db.Where("key = ?", "captcha.provider").Delete(&ConfigEntry{})
			db.Create(&ConfigEntry{Key: "captcha.provider", Value: "cloudflare"})
		}
	}

	// Migrate forgot password turnstile settings
	forgotMigrations := map[string]string{
		"turnstile.forgot_password_request": "captcha.forgot_password_request",
		"turnstile.forgot_password_reset":   "captcha.forgot_password_reset",
	}
	for oldKey, newKey := range forgotMigrations {
		var entry ConfigEntry
		if err := db.Where("key = ?", oldKey).First(&entry).Error; err != nil {
			continue
		}
		db.Where("key = ?", newKey).Delete(&ConfigEntry{})
		db.Create(&ConfigEntry{Key: newKey, Value: entry.Value})
	}

	return nil
}
