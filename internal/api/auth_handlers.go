package api

import (
	"context"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"skyimage/internal/data"
	"skyimage/internal/middleware"
	"skyimage/internal/users"
)

func (s *Server) registerAuthRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	auth.POST("/login", s.handleLogin)
	auth.POST("/register", s.handleRegister)
	auth.POST("/send-verification-code", s.handleSendVerificationCode)
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
		log.Printf("[邮件] 准备发送验证码到: %s, 验证码: %s", input.Email, code)
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

	// 生成JWT token以便自动登录
	token, err := s.users.GenerateToken(user)
	if err != nil {
		log.Printf("[注册] 生成token失败: %v", err)
		// 即使token生成失败，也返回用户信息，前端会跳转到登录页
		c.JSON(http.StatusOK, gin.H{"data": user})
		return
	}

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

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"token": token,
		"user":  user,
	}})
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
