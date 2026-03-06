package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"skyimage/internal/data"
	"skyimage/internal/middleware"
	"skyimage/internal/session"
	"skyimage/internal/users"
)

func (s *Server) registerAuthRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	auth.POST("/login", s.handleLogin)
	auth.POST("/register", s.handleRegister)
	auth.POST("/send-verification-code", s.handleSendVerificationCode)
	auth.POST("/logout", s.authMiddleware(), middleware.RequireCSRF(), s.handleLogout)
	auth.GET("/needs-setup", s.handleNeedsSetup)
	auth.GET("/registration-status", s.handleRegistrationStatus)

	protected := auth.Group("/")
	protected.Use(s.authMiddleware())
	protected.GET("/me", s.handleMe)
}

func (s *Server) handleSendVerificationCode(c *gin.Context) {
	// 检查是否启用注册邮件验证
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "系统错误"})
		return
	}

	if settings["mail.register.verify"] != "true" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邮件验证未启用"})
		return
	}

	var input struct {
		Email          string `json:"email" binding:"required,email"`
		TurnstileToken string `json:"turnstileToken"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入有效的邮箱地址"})
		return
	}
	clientIP := c.ClientIP()
	emailKey := strings.ToLower(strings.TrimSpace(input.Email))
	if ok, retry := s.authLimiter.Allow("verify:ip:"+clientIP, 10, time.Minute); !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁，请稍后再试", "retryAfterSeconds": int(retry.Seconds()) + 1})
		return
	}
	if ok, retry := s.authLimiter.Allow("verify:email:"+emailKey, 3, time.Minute); !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "该邮箱请求过于频繁，请稍后再试", "retryAfterSeconds": int(retry.Seconds()) + 1})
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
			c.JSON(http.StatusBadRequest, gin.H{"error": "请完成人机验证"})
			return
		}
		valid, err := s.turnstile.Verify(c.Request.Context(), input.TurnstileToken, c.ClientIP())
		if err != nil || !valid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "人机验证失败，请重试"})
			return
		}
	}

	// 检查邮箱是否已注册
	var count int64
	if err := s.db.Model(&data.User{}).Where("email = ?", input.Email).Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "系统错误"})
		return
	}
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该邮箱已被注册"})
		return
	}

	// 生成验证码
	code := s.verification.GenerateCode()
	s.verification.StoreCode(input.Email, code)

	// 发送验证码邮件
	go func() {
		ctx := context.Background()
		log.Printf("[邮件] 准备发送验证码到: %s", input.Email)
		if err := s.mail.SendVerificationCode(ctx, input.Email, code); err != nil {
			log.Printf("[邮件] 发送验证码失败: %v", err)
		} else {
			log.Printf("[邮件] 验证码发送成功")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "验证码已发送，请查收邮件"}})
}

func (s *Server) handleRegister(c *gin.Context) {
	// 检查数据库中的注册设置
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err == nil && settings["features.allow_registration"] == "false" {
		c.JSON(http.StatusForbidden, gin.H{"error": "registration disabled"})
		return
	}
	// 兼容环境变量配置
	if !s.cfg.AllowRegistration {
		c.JSON(http.StatusForbidden, gin.H{"error": "registration disabled"})
		return
	}

	// 检查是否启用邮件验证
	emailVerifyEnabled := settings["mail.register.verify"] == "true"

	var input struct {
		users.RegisterInput
		TurnstileToken   string `json:"turnstileToken"`
		VerificationCode string `json:"verificationCode"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整信息"})
		return
	}

	// 如果启用了邮件验证，验证邮箱验证码
	if emailVerifyEnabled {
		if input.VerificationCode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请输入邮箱验证码"})
			return
		}
		valid, err := s.verification.VerifyCode(input.Email, input.VerificationCode)
		if err != nil || !valid {
			errMsg := "验证码错误"
			if err != nil {
				errMsg = err.Error()
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
			return
		}
	}

	// 设置注册IP
	input.RegisterInput.RegisteredIP = c.ClientIP()

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

	sessionID, err := s.session.Create(user.ID)
	if err != nil {
		log.Printf("[注册] 创建会话失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}
	s.writeSessionCookie(c, sessionID)
	s.writeCSRFCookie(c)

	// 发送注册成功邮件（异步，不阻塞响应）
	go func() {
		ctx := context.Background()
		log.Printf("[邮件] 准备发送注册成功邮件到: %s, 用户: %s", user.Email, user.Name)
		if err := s.mail.SendRegistrationSuccessEmail(ctx, user.Email, user.Name); err != nil {
			log.Printf("[邮件] 发送注册成功邮件失败: %v", err)
		} else {
			log.Printf("[邮件] 注册成功邮件发送成功")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"user": user}})
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
	clientIP := c.ClientIP()
	emailKey := strings.ToLower(strings.TrimSpace(input.Email))
	if ok, retry := s.authLimiter.Allow("login:ip:"+clientIP, 20, time.Minute); !ok {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "登录请求过于频繁，请稍后再试", "retryAfterSeconds": int(retry.Seconds()) + 1})
		return
	}
	if emailKey != "" {
		if ok, retry := s.authLimiter.Allow("login:email:"+emailKey, 10, time.Minute); !ok {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "账号尝试次数过多，请稍后再试", "retryAfterSeconds": int(retry.Seconds()) + 1})
			return
		}
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

	user, err := s.users.Login(c.Request.Context(), input.LoginInput)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	sessionID, err := s.session.Create(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
		return
	}
	s.writeSessionCookie(c, sessionID)
	s.writeCSRFCookie(c)

	// 发送登录提醒邮件（异步，不阻塞响应）
	go func() {
		ctx := context.Background()
		log.Printf("[邮件] 准备发送登录提醒邮件到: %s, 用户: %s, IP: %s", user.Email, user.Name, clientIP)
		if err := s.mail.SendLoginNotification(ctx, user.Email, user.Name, clientIP); err != nil {
			log.Printf("[邮件] 发送登录提醒邮件失败: %v", err)
		} else {
			log.Printf("[邮件] 登录提醒邮件发送成功")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"user": user}})
}

func (s *Server) handleLogout(c *gin.Context) {
	if sessionID, err := c.Cookie(session.CookieName); err == nil && sessionID != "" {
		s.session.Delete(sessionID)
	}
	s.clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "logged out"}})
}

func (s *Server) writeSessionCookie(c *gin.Context, sessionID string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     session.CookieName,
		Value:    sessionID,
		Path:     "/",
		MaxAge:   int(s.session.TTL().Seconds()),
		HttpOnly: true,
		Secure:   isSecureRequest(c),
		SameSite: http.SameSiteStrictMode, // 修改为 Strict 模式以增强安全性
	})
}

func (s *Server) writeCSRFCookie(c *gin.Context) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    hex.EncodeToString(token),
		Path:     "/",
		MaxAge:   int(s.session.TTL().Seconds()),
		HttpOnly: false,
		Secure:   isSecureRequest(c),
		SameSite: http.SameSiteStrictMode,
	})
}

func (s *Server) clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     session.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   isSecureRequest(c),
		SameSite: http.SameSiteStrictMode, // 修改为 Strict 模式以增强安全性
	})
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: false,
		Secure:   isSecureRequest(c),
		SameSite: http.SameSiteStrictMode,
	})
}

func isSecureRequest(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	return strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
}

func (s *Server) handleMe(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if _, err := c.Cookie(middleware.CSRFCookieName); err != nil {
		s.writeCSRFCookie(c)
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

func (s *Server) handleRegistrationStatus(c *gin.Context) {
	// 检查数据库中的注册设置
	settings, err := s.admin.GetSettings(c.Request.Context())
	allowed := true
	emailVerifyEnabled := false

	if err == nil {
		if settings["features.allow_registration"] == "false" {
			allowed = false
		}
		emailVerifyEnabled = settings["mail.register.verify"] == "true"
	}

	// 兼容环境变量配置
	if !s.cfg.AllowRegistration {
		allowed = false
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"allowed":            allowed,
		"emailVerifyEnabled": emailVerifyEnabled,
	}})
}
