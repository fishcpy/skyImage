package api

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"skyimage/internal/middleware"
	"skyimage/internal/users"
)

func (s *Server) registerAuthRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	auth.POST("/login", s.handleLogin)
	auth.POST("/register", s.handleRegister)
	auth.GET("/needs-setup", s.handleNeedsSetup)

	protected := auth.Group("/")
	protected.Use(s.authMiddleware())
	protected.GET("/me", s.handleMe)
}

func (s *Server) handleRegister(c *gin.Context) {
	if !s.cfg.AllowRegistration {
		c.JSON(http.StatusForbidden, gin.H{"error": "registration disabled"})
		return
	}
	var input struct {
		users.RegisterInput
		TurnstileToken string `json:"turnstileToken"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify Turnstile token if enabled
	enabled, err := s.turnstile.IsEnabled(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check turnstile status"})
		return
	}
	if enabled {
		if input.TurnstileToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "turnstile token required"})
			return
		}
		valid, err := s.turnstile.Verify(c.Request.Context(), input.TurnstileToken, c.ClientIP())
		if err != nil || !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "turnstile verification failed"})
			return
		}
	}

	user, err := s.users.Register(c.Request.Context(), input.RegisterInput)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 发送欢迎邮件（异步，不阻塞响应）
	go func() {
		ctx := context.Background()
		log.Printf("[邮件] 准备发送欢迎邮件到: %s, 用户: %s", user.Email, user.Name)
		if err := s.mail.SendWelcomeEmail(ctx, user.Email, user.Name); err != nil {
			log.Printf("[邮件] 发送欢迎邮件失败: %v", err)
		} else {
			log.Printf("[邮件] 欢迎邮件发送成功")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"data": user})
}

func (s *Server) handleLogin(c *gin.Context) {
	var input struct {
		users.LoginInput
		TurnstileToken string `json:"turnstileToken"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify Turnstile token if enabled
	enabled, err := s.turnstile.IsEnabled(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check turnstile status"})
		return
	}
	if enabled {
		if input.TurnstileToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "turnstile token required"})
			return
		}
		valid, err := s.turnstile.Verify(c.Request.Context(), input.TurnstileToken, c.ClientIP())
		if err != nil || !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "turnstile verification failed"})
			return
		}
	}

	result, err := s.users.Login(c.Request.Context(), input.LoginInput)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	// 发送登录提醒邮件（异步，不阻塞响应）
	go func() {
		ctx := context.Background()
		clientIP := c.ClientIP()
		log.Printf("[邮件] 准备发送登录提醒邮件到: %s, 用户: %s, IP: %s", result.User.Email, result.User.Name, clientIP)
		if err := s.mail.SendLoginNotification(ctx, result.User.Email, result.User.Name, clientIP); err != nil {
			log.Printf("[邮件] 发送登录提醒邮件失败: %v", err)
		} else {
			log.Printf("[邮件] 登录提醒邮件发送成功")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (s *Server) handleMe(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func (s *Server) handleNeedsSetup(c *gin.Context) {
	hasUsers, err := s.users.HasUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"hasUsers": hasUsers}})
}
