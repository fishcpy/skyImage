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
			// 如果没有配置路径，使用默认路径
			dbPath = filepath.Join("storage", "data", "skyImage.db")
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

	if err := db.AutoMigrate(
		&Group{},
		&User{},
		&FileAsset{},
		&ConfigEntry{},
		&Strategy{},
		&GroupStrategy{},
		&InstallerState{},
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
