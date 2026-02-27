package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

// Config stores the runtime settings for the Go backend.
type Config struct {
	HTTPAddr          string `mapstructure:"HTTP_ADDR"`
	DatabasePath      string `mapstructure:"DATABASE_PATH"`
	DatabaseType      string `mapstructure:"DATABASE_TYPE"` // sqlite, mysql, postgres
	DatabaseHost      string `mapstructure:"DATABASE_HOST"`
	DatabasePort      string `mapstructure:"DATABASE_PORT"`
	DatabaseName      string `mapstructure:"DATABASE_NAME"`
	DatabaseUser      string `mapstructure:"DATABASE_USER"`
	DatabasePassword  string `mapstructure:"DATABASE_PASSWORD"`
	StoragePath       string `mapstructure:"STORAGE_PATH"`
	PublicBaseURL     string `mapstructure:"PUBLIC_BASE_URL"`
	JWTSecret         string `mapstructure:"JWT_SECRET"`
	LegacyDSN         string `mapstructure:"LEGACY_DSN"`
	FrontendDist      string `mapstructure:"FRONTEND_DIST"`
	AllowRegistration bool   `mapstructure:"ALLOW_REGISTRATION"`
}

// Load reads configuration from env variables and optional .env/.yaml files.
func Load() (Config, error) {
	viper.SetConfigName(".env")
	viper.SetConfigType("env")
	viper.AddConfigPath(".")
	viper.AutomaticEnv()

	setDefaults()

	_ = viper.ReadInConfig() // best-effort optional .env

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return Config{}, fmt.Errorf("unmarshal config: %w", err)
	}

	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET must be set")
	}

	if err := ensurePaths(&cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func MustLoad() Config {
	cfg, err := Load()
	if err != nil {
		panic(err)
	}
	return cfg
}

func setDefaults() {
	viper.SetDefault("HTTP_ADDR", ":8080")
	viper.SetDefault("DATABASE_TYPE", "")
	viper.SetDefault("DATABASE_PATH", "")
	viper.SetDefault("DATABASE_HOST", "")
	viper.SetDefault("DATABASE_PORT", "")
	viper.SetDefault("DATABASE_NAME", "")
	viper.SetDefault("DATABASE_USER", "")
	viper.SetDefault("DATABASE_PASSWORD", "")
	viper.SetDefault("STORAGE_PATH", filepath.Join("storage", "uploads"))
	viper.SetDefault("PUBLIC_BASE_URL", "http://localhost:8080")
	viper.SetDefault("ALLOW_REGISTRATION", true)
}

func ensurePaths(cfg *Config) error {
	// 只有在明确选择 SQLite 且指定了路径后才创建数据库目录，避免安装前就生成数据库文件
	if cfg.DatabaseType == "sqlite" && cfg.DatabasePath != "" {
		if err := os.MkdirAll(filepath.Dir(cfg.DatabasePath), 0o755); err != nil {
			return fmt.Errorf("create database dir: %w", err)
		}
	}
	if err := os.MkdirAll(cfg.StoragePath, 0o755); err != nil {
		return fmt.Errorf("create storage dir: %w", err)
	}
	return nil
}
