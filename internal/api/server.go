package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"skyimage/internal/admin"
	"skyimage/internal/config"
	"skyimage/internal/files"
	"skyimage/internal/installer"
	"skyimage/internal/mail"
	"skyimage/internal/middleware"
	"skyimage/internal/turnstile"
	"skyimage/internal/users"
	"skyimage/internal/verification"
)

type Server struct {
	engine       *gin.Engine
	mu           sync.RWMutex
	cfg          config.Config
	db           *gorm.DB
	installer    *installer.Service
	admin        *admin.Service
	files        *files.Service
	users        *users.Service
	mail         *mail.Service
	turnstile    *turnstile.Service
	verification *verification.Service
}

func NewServer(cfg config.Config, db *gorm.DB) *Server {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery(), middleware.CORS())
	engine.RedirectTrailingSlash = false

	s := &Server{
		engine: engine,
	}
	s.applyRuntimeConfig(cfg, db)
	s.installer = installer.New(db, cfg, s.applyRuntimeConfig)
	s.registerRoutes()
	return s
}

func (s *Server) applyRuntimeConfig(cfg config.Config, db *gorm.DB) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil && s.db != db {
		if sqlDB, err := s.db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}
	s.cfg = cfg
	s.db = db
	adminService := admin.New(db)
	s.admin = adminService
	s.files = files.New(db, cfg)
	s.users = users.New(db, cfg.JWTSecret)
	s.mail = mail.New(adminService)
	s.turnstile = turnstile.New(adminService)
	s.verification = verification.New()
	if s.installer != nil {
		s.installer.SetRuntime(db, cfg)
	}
}

func (s *Server) Run(ctx context.Context) error {
	srv := &http.Server{
		Addr:    s.cfg.HTTPAddr,
		Handler: s.engine,
	}
	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		ctxShutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(ctxShutdown)
	case err := <-errCh:
		return err
	}
}

func (s *Server) healthHandler(c *gin.Context) {
	status, err := s.installer.Status(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"status":    "ok",
			"installer": status,
		},
	})
}

func (s *Server) registerRoutes() {
	apiGroup := s.engine.Group("/api")
	apiGroup.GET("/health", s.healthHandler)
	s.registerInstallerRoutes(apiGroup)
	s.registerAuthRoutes(apiGroup)
	s.registerAccountRoutes(apiGroup)
	s.registerAdminRoutes(apiGroup)
	s.registerFileRoutes(apiGroup)
	s.registerSiteRoutes(apiGroup)
	s.registerStaticAssets()
	s.registerFrontend()
}

func (s *Server) registerFrontend() {
	distPath := filepath.Clean(s.cfg.FrontendDist)
	assetsPath := filepath.Join(distPath, "assets")
	s.engine.StaticFS("/assets", gin.Dir(assetsPath, false))

	s.engine.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.Next()
			return
		}
		if strings.HasPrefix(c.Request.URL.Path, "/assets/") {
			c.Next()
			return
		}
		c.Next()
	})

	s.engine.NoRoute(func(c *gin.Context) {
		indexPath := filepath.Join(distPath, "index.html")
		c.File(indexPath)
	})
}

func (s *Server) registerStaticAssets() {
	mounted := make(map[string]struct{})
	mountPath := func(prefix string, root string) {
		prefix = strings.Trim(prefix, "/")
		root = strings.TrimSpace(root)
		if prefix == "" || root == "" {
			return
		}
		path := "/" + prefix
		if _, exists := mounted[path]; exists {
			return
		}
		cleanRoot := filepath.Clean(root)
		s.engine.StaticFS(path, gin.Dir(cleanRoot, false))
		mounted[path] = struct{}{}
	}

	mountPath(s.defaultLocalPublicSegment(), s.cfg.StoragePath)

	strategies, err := s.admin.ListStrategies(context.Background())
	if err != nil {
		log.Printf("load strategies for static mounts: %v", err)
		return
	}
	for _, strategy := range strategies {
		var cfg map[string]interface{}
		if len(strategy.Configs) == 0 {
			continue
		}
		if err := json.Unmarshal(strategy.Configs, &cfg); err != nil {
			log.Printf("parse strategy config for static mount: %v", err)
			continue
		}
		driver := strings.ToLower(stringValue(cfg, "driver"))
		if driver == "" {
			driver = "local"
		}
		if driver != "local" {
			continue
		}
		root := stringValue(cfg, "root")
		if root == "" {
			root = s.cfg.StoragePath
		}
		baseURL := pathPrefix(stringValue(cfg, "url"))
		if baseURL == "" {
			baseURL = pathPrefix(stringValue(cfg, "base_url"))
		}
		if baseURL == "" {
			baseURL = pathPrefix(stringValue(cfg, "baseUrl"))
		}
		if baseURL == "" {
			baseURL = s.defaultLocalPublicSegment()
		}
		mountPath(baseURL, root)
	}
}

func pathPrefix(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "//") {
		raw = "http:" + raw
	}
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err == nil {
			return strings.Trim(strings.Trim(u.Path, "/"), "/")
		}
	}
	return strings.Trim(strings.Trim(raw, "/"), "/")
}

func stringValue(cfg map[string]interface{}, key string) string {
	if v, ok := cfg[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (s *Server) defaultLocalPublicSegment() string {
	segment := filepath.Base(s.cfg.StoragePath)
	segment = strings.Trim(segment, "/")
	if segment == "" || segment == "." {
		return "uploads"
	}
	return segment
}

func (s *Server) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		s.mu.RLock()
		userService := s.users
		s.mu.RUnlock()
		middleware.Auth(userService)(c)
	}
}
