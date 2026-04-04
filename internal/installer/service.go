package installer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/version"
)

type SwitchDatabaseFunc func(cfg config.Config, db *gorm.DB)

type Service struct {
	db       *gorm.DB
	cfg      config.Config
	switchDB SwitchDatabaseFunc
}

func New(db *gorm.DB, cfg config.Config, switchDB SwitchDatabaseFunc) *Service {
	return &Service{db: db, cfg: cfg, switchDB: switchDB}
}

func (s *Service) SetRuntime(db *gorm.DB, cfg config.Config) {
	s.db = db
	s.cfg = cfg
}

type Status struct {
	Installed bool      `json:"installed"`
	SiteName  string    `json:"siteName"`
	Version   string    `json:"version"`
	About     string    `json:"about"`
	Timestamp time.Time `json:"timestamp"`
}

type RunInput struct {
	// 数据库配置
	DatabaseType     string `json:"databaseType"`
	DatabasePath     string `json:"databasePath"` // SQLite 路径
	DatabaseHost     string `json:"databaseHost"`
	DatabasePort     string `json:"databasePort"`
	DatabaseName     string `json:"databaseName"`
	DatabaseUser     string `json:"databaseUser"`
	DatabasePassword string `json:"databasePassword"`
	// 站点配置
	SiteName      string `json:"siteName" binding:"required"`
	AdminName     string `json:"adminName" binding:"required"`
	AdminEmail    string `json:"adminEmail" binding:"required,email"`
	AdminPassword string `json:"adminPassword" binding:"required,min=8"`
}

func (s *Service) Status(ctx context.Context) (Status, error) {
	var state data.InstallerState
	err := s.db.WithContext(ctx).Order("id DESC").First(&state).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Status{
			Installed: false,
			Version:   version.Version,
			About:     version.About,
		}, nil
	}
	if err != nil {
		return Status{}, err
	}
	var userCount int64
	if err := s.db.WithContext(ctx).Model(&data.User{}).Count(&userCount).Error; err != nil {
		return Status{}, err
	}
	installed := state.IsCompleted && userCount > 0
	return Status{
		Installed: installed,
		SiteName:  state.SiteName,
		Version:   version.Version,
		About:     version.About,
		Timestamp: state.CompletedAt,
	}, nil
}

func (s *Service) EnsureBootstrap(ctx context.Context) error {
	_, err := s.Status(ctx)
	return err
}

func (s *Service) Run(ctx context.Context, in RunInput) (Status, error) {
	status, err := s.Status(ctx)
	if err != nil {
		return Status{}, err
	}
	if status.Installed {
		return status, fmt.Errorf("installer already completed")
	}

	targetCfg, err := s.buildTargetConfig(in)
	if err != nil {
		return Status{}, err
	}

	needSwitch := !databaseConfigEqual(s.cfg, targetCfg)
	dbConn := s.db
	if needSwitch {
		dbConn, err = data.NewDatabase(targetCfg)
		if err != nil {
			return Status{}, fmt.Errorf("connect database: %w", err)
		}
	}

	var result Status
	err = dbConn.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		groupID, err := ensureDefaultGroup(tx)
		if err != nil {
			return err
		}
		strategyID, err := ensureDefaultStrategy(tx, targetCfg, groupID)
		if err != nil {
			return err
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(in.AdminPassword), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}

		configs := map[string]interface{}{
			"default_visibility": "private",
		}
		if strategyID > 0 {
			configs["default_strategy"] = strategyID
		}
		cfgBytes, _ := json.Marshal(configs)
		admin := data.User{
			GroupID:      &groupID,
			Name:         in.AdminName,
			Email:        in.AdminEmail,
			PasswordHash: string(hashed),
			IsAdmin:      true,
			IsSuperAdmin: true,
			Status:       1,
			Configs:      datatypes.JSON(cfgBytes),
		}
		if err := tx.Create(&admin).Error; err != nil {
			return fmt.Errorf("create admin: %w", err)
		}

		defaultSettings := map[string]string{
			"site.name":                                in.SiteName,
			"site.title":                               in.SiteName,
			"site.console_url":                         "http://localhost:8080",
			"site.description":                         "云端图床",
			"site.slogan":                              "简单、稳定、可扩展的图像托管平台",
			"home.badge_text":                          "新首页",
			"home.intro_text":                          "面向团队和个人的现代化图像托管面板，支持多策略存储、权限控制和 API 接入。",
			"home.primary_cta_text":                    "登录系统",
			"home.dashboard_cta_text":                  "进入控制台",
			"home.secondary_cta_text":                  "注册账号",
			"home.feature1_title":                      "图像管理",
			"home.feature1_desc":                       "上传、检索、批量操作和链接复制一体化。",
			"home.feature2_title":                      "权限与安全",
			"home.feature2_desc":                       "支持角色组、注册策略和登录验证配置。",
			"home.feature3_title":                      "可配置品牌信息",
			"home.feature3_desc":                       "站点标题、描述和首页标语均可在系统设置中管理。",
			"site.terms_of_service":                    DefaultTermsOfService,
			"site.privacy_policy":                      DefaultPrivacyPolicy,
			"storage.root":                             s.cfg.StoragePath,
			"features.gallery":                         "true",
			"features.home":                            "true",
			"features.api":                             "true",
			"images.load_rows":                         "4",
			"mail.smtp.host":                           "",
			"mail.smtp.port":                           "",
			"mail.smtp.username":                       "",
			"mail.smtp.password":                       "",
			"mail.smtp.from":                           "",
			"mail.smtp.secure":                         "false",
			"mail.template.test.subject":               "",
			"mail.template.test.body":                  "",
			"mail.template.register_verify.subject":    "",
			"mail.template.register_verify.body":       "",
			"mail.template.register_success.subject":   "",
			"mail.template.register_success.body":      "",
			"mail.template.login_notification.subject": "",
			"mail.template.login_notification.body":    "",
			"mail.template.forgot_password.subject":    "",
			"mail.template.forgot_password.body":       "",
			"mail.register.verify":                     "false",
			"mail.login.notification":                  "false",
			"mail.forgot_password.enabled":             "false",
			"mail.forgot_password.turnstile_request":   "false",
			"mail.forgot_password.turnstile_reset":     "false",
		}
		for key, value := range defaultSettings {
			if err := upsertConfig(tx, key, value); err != nil {
				return err
			}
		}

		state := data.InstallerState{
			IsCompleted: true,
			Version:     version.Version,
			SiteName:    in.SiteName,
			CompletedAt: time.Now(),
		}
		if err := tx.Create(&state).Error; err != nil {
			return fmt.Errorf("save installer state: %w", err)
		}
		result = Status{
			Installed: true,
			SiteName:  state.SiteName,
			Version:   state.Version,
			About:     version.About,
			Timestamp: state.CompletedAt,
		}
		return nil
	})
	if err != nil {
		if needSwitch {
			closeDB(dbConn)
		}
		return Status{}, err
	}

	if err := saveDatabaseConfig(targetCfg); err != nil {
		if needSwitch {
			closeDB(dbConn)
		}
		return Status{}, fmt.Errorf("save database config: %w", err)
	}

	if needSwitch && s.switchDB != nil {
		s.switchDB(targetCfg, dbConn)
	} else {
		s.SetRuntime(dbConn, targetCfg)
	}

	return result, nil
}

func (s *Service) buildTargetConfig(in RunInput) (config.Config, error) {
	cfg := s.cfg
	dbType := strings.ToLower(strings.TrimSpace(in.DatabaseType))
	if dbType == "" {
		dbType = strings.ToLower(strings.TrimSpace(cfg.DatabaseType))
	}
	if dbType == "" {
		dbType = "sqlite"
	}
	switch dbType {
	case "sqlite":
		path := strings.TrimSpace(in.DatabasePath)
		if path == "" {
			path = strings.TrimSpace(cfg.DatabasePath)
		}
		if path == "" {
			path = filepath.Join("storage", "data", "skyImage.db")
		}
		cfg.DatabasePath = path
		cfg.DatabaseHost = ""
		cfg.DatabasePort = ""
		cfg.DatabaseName = ""
		cfg.DatabaseUser = ""
		cfg.DatabasePassword = ""
	case "mysql", "postgres", "postgresql":
		host := pickString(in.DatabaseHost, cfg.DatabaseHost)
		port := pickString(in.DatabasePort, cfg.DatabasePort)
		name := pickString(in.DatabaseName, cfg.DatabaseName)
		user := pickString(in.DatabaseUser, cfg.DatabaseUser)
		pass := pickString(in.DatabasePassword, cfg.DatabasePassword)
		if host == "" || port == "" || name == "" || user == "" {
			return cfg, fmt.Errorf("database connection info incomplete")
		}
		cfg.DatabaseHost = host
		cfg.DatabasePort = port
		cfg.DatabaseName = name
		cfg.DatabaseUser = user
		cfg.DatabasePassword = pass
		cfg.DatabasePath = ""
	default:
		return cfg, fmt.Errorf("unsupported database type: %s", dbType)
	}
	cfg.DatabaseType = dbType
	return cfg, nil
}

func pickString(primary, fallback string) string {
	if v := strings.TrimSpace(primary); v != "" {
		return v
	}
	return strings.TrimSpace(fallback)
}

func databaseConfigEqual(a, b config.Config) bool {
	return strings.EqualFold(strings.TrimSpace(a.DatabaseType), strings.TrimSpace(b.DatabaseType)) &&
		strings.TrimSpace(a.DatabaseHost) == strings.TrimSpace(b.DatabaseHost) &&
		strings.TrimSpace(a.DatabasePort) == strings.TrimSpace(b.DatabasePort) &&
		strings.TrimSpace(a.DatabaseName) == strings.TrimSpace(b.DatabaseName) &&
		strings.TrimSpace(a.DatabaseUser) == strings.TrimSpace(b.DatabaseUser) &&
		strings.TrimSpace(a.DatabasePassword) == strings.TrimSpace(b.DatabasePassword) &&
		cleanPath(a.DatabasePath) == cleanPath(b.DatabasePath)
}

func cleanPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	return filepath.Clean(p)
}

func closeDB(db *gorm.DB) {
	if db == nil {
		return
	}
	if sqlDB, err := db.DB(); err == nil {
		_ = sqlDB.Close()
	}
}

func ensureDefaultGroup(tx *gorm.DB) (uint, error) {
	var group data.Group
	err := tx.Where("is_default = ?", true).First(&group).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		group = data.Group{
			Name:      "Default",
			IsDefault: true,
			Configs: datatypes.JSON([]byte(`{
				"max_file_size": 10485760,
				"max_capacity": 1073741824,
				"default_visibility": "private",
				"upload_rate_minute": 0,
				"upload_rate_hour": 0
			}`)),
		}
		if err := tx.Create(&group).Error; err != nil {
			return 0, fmt.Errorf("create default group: %w", err)
		}
		return group.ID, nil
	}
	if err != nil {
		return 0, err
	}
	return group.ID, nil
}

func upsertConfig(tx *gorm.DB, key string, value string) error {
	entry := data.ConfigEntry{
		Key:   key,
		Value: value,
	}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.Assignments(map[string]interface{}{"value": value, "updated_at": gorm.Expr("CURRENT_TIMESTAMP")}),
	}).Create(&entry).Error
}

func ensureDefaultStrategy(tx *gorm.DB, cfg config.Config, groupID uint) (uint, error) {
	var strategy data.Strategy
	err := tx.Order("id ASC").First(&strategy).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		configs := map[string]string{
			"driver":   "local",
			"root":     cfg.StoragePath,
			"url":      cfg.PublicBaseURL,
			"base_url": cfg.PublicBaseURL,
		}
		cfgBytes, _ := json.Marshal(configs)
		strategy = data.Strategy{
			Key:     1,
			Name:    "本地存储",
			Intro:   "系统默认的本地策略",
			Configs: datatypes.JSON(cfgBytes),
		}
		if err := tx.Create(&strategy).Error; err != nil {
			return 0, fmt.Errorf("create default strategy: %w", err)
		}
	} else if err != nil {
		return 0, err
	}
	link := data.GroupStrategy{GroupID: groupID, StrategyID: strategy.ID}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&link).Error; err != nil {
		return 0, fmt.Errorf("assign strategy: %w", err)
	}
	return strategy.ID, nil
}

func saveDatabaseConfig(cfg config.Config) error {
	envPath := ".env"
	content := ""

	if existingContent, err := os.ReadFile(envPath); err == nil {
		content = string(existingContent)
	}

	updates := map[string]string{
		"DATABASE_TYPE":     cfg.DatabaseType,
		"DATABASE_PATH":     cfg.DatabasePath,
		"DATABASE_HOST":     cfg.DatabaseHost,
		"DATABASE_PORT":     cfg.DatabasePort,
		"DATABASE_NAME":     cfg.DatabaseName,
		"DATABASE_USER":     cfg.DatabaseUser,
		"DATABASE_PASSWORD": cfg.DatabasePassword,
	}

	for key, value := range updates {
		sanitized, err := sanitizeEnvValue(value)
		if err != nil {
			return fmt.Errorf("invalid %s: %w", key, err)
		}
		if strings.TrimSpace(sanitized) == "" {
			continue
		}
		pattern := fmt.Sprintf("%s=", key)
		lineValue := quoteEnvValue(sanitized)
		if strings.Contains(content, pattern) {
			lines := strings.Split(content, "\n")
			for i, line := range lines {
				if strings.HasPrefix(strings.TrimSpace(line), pattern) {
					lines[i] = fmt.Sprintf("%s=%s", key, lineValue)
				}
			}
			content = strings.Join(lines, "\n")
		} else {
			if content != "" && !strings.HasSuffix(content, "\n") {
				content += "\n"
			}
			content += fmt.Sprintf("%s=%s\n", key, lineValue)
		}
	}

	return os.WriteFile(envPath, []byte(content), 0o644)
}

func sanitizeEnvValue(raw string) (string, error) {
	if strings.Contains(raw, "\x00") {
		return "", fmt.Errorf("contains null byte")
	}
	if strings.Contains(raw, "\n") || strings.Contains(raw, "\r") {
		return "", fmt.Errorf("contains newline")
	}
	return raw, nil
}

func quoteEnvValue(raw string) string {
	escaped := strings.ReplaceAll(raw, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	return `"` + escaped + `"`
}
