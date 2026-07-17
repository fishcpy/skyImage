package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/dbmigrate"
)

type databaseConfigView struct {
	Type        string `json:"type"`
	Path        string `json:"path,omitempty"`
	Host        string `json:"host,omitempty"`
	Port        string `json:"port,omitempty"`
	Name        string `json:"name,omitempty"`
	User        string `json:"user,omitempty"`
	HasPassword bool   `json:"hasPassword"`
}

type databaseTargetInput struct {
	Type     string `json:"type" binding:"required"`
	Path     string `json:"path"`
	Host     string `json:"host"`
	Port     string `json:"port"`
	Name     string `json:"name"`
	User     string `json:"user"`
	Password string `json:"password"`
}

type databaseMigrateInput struct {
	Target         databaseTargetInput `json:"target" binding:"required"`
	TruncateTarget bool                `json:"truncateTarget"`
	SwitchRuntime  bool                `json:"switchRuntime"`
	BatchSize      int                 `json:"batchSize"`
}

func (s *Server) handleAdminDatabaseConfig(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	cfg := s.cfg
	c.JSON(http.StatusOK, gin.H{
		"data": databaseConfigView{
			Type:        data.DialectorType(cfg),
			Path:        cfg.DatabasePath,
			Host:        cfg.DatabaseHost,
			Port:        cfg.DatabasePort,
			Name:        cfg.DatabaseName,
			User:        cfg.DatabaseUser,
			HasPassword: strings.TrimSpace(cfg.DatabasePassword) != "",
		},
	})
}

func (s *Server) handleAdminDatabaseTest(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	if s.cfg.DemoMode {
		c.JSON(http.StatusForbidden, gin.H{"error": "演示站禁止数据库操作"})
		return
	}
	var in databaseTargetInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target, err := s.buildTargetConfig(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := dbmigrate.TestConnection(target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

func (s *Server) handleAdminDatabaseMigrate(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	if s.cfg.DemoMode {
		c.JSON(http.StatusForbidden, gin.H{"error": "演示站禁止数据库迁移"})
		return
	}

	var in databaseMigrateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	target, err := s.buildTargetConfig(in.Target)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := dbmigrate.Migrate(c.Request.Context(), s.cfg, target, dbmigrate.Options{
		TruncateTarget: in.TruncateTarget,
		SwitchRuntime:  in.SwitchRuntime,
		BatchSize:      in.BatchSize,
		OnSwitched:     s.applyRuntimeConfig,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (s *Server) buildTargetConfig(in databaseTargetInput) (config.Config, error) {
	cfg := s.cfg
	dbType := strings.ToLower(strings.TrimSpace(in.Type))
	if dbType == "postgresql" {
		dbType = "postgres"
	}
	cfg.DatabaseType = dbType

	switch dbType {
	case "sqlite":
		path := strings.TrimSpace(in.Path)
		if path == "" {
			path = filepath.Join("storage", "data", "skyimage.db")
		}
		cfg.DatabasePath = path
		cfg.DatabaseHost = ""
		cfg.DatabasePort = ""
		cfg.DatabaseName = ""
		cfg.DatabaseUser = ""
		cfg.DatabasePassword = ""
	case "mysql", "postgres":
		cfg.DatabaseHost = strings.TrimSpace(in.Host)
		cfg.DatabasePort = strings.TrimSpace(in.Port)
		cfg.DatabaseName = strings.TrimSpace(in.Name)
		cfg.DatabaseUser = strings.TrimSpace(in.User)
		pass := in.Password
		if pass == "***" || (pass == "" && sameServerCredentials(s.cfg, cfg)) {
			pass = s.cfg.DatabasePassword
		}
		cfg.DatabasePassword = pass
		cfg.DatabasePath = ""
		if cfg.DatabasePort == "" {
			if dbType == "postgres" {
				cfg.DatabasePort = "5432"
			} else {
				cfg.DatabasePort = "3306"
			}
		}
	default:
		return cfg, fmt.Errorf("unsupported database type: %s", dbType)
	}

	if err := data.ValidateDatabaseConfig(cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func sameServerCredentials(current, target config.Config) bool {
	return data.DialectorType(current) == data.DialectorType(target) &&
		strings.TrimSpace(current.DatabaseHost) == strings.TrimSpace(target.DatabaseHost) &&
		strings.TrimSpace(current.DatabasePort) == strings.TrimSpace(target.DatabasePort) &&
		strings.TrimSpace(current.DatabaseName) == strings.TrimSpace(target.DatabaseName) &&
		strings.TrimSpace(current.DatabaseUser) == strings.TrimSpace(target.DatabaseUser)
}
