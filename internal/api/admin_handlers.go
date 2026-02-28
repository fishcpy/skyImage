package api

import (
	"crypto/tls"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"skyimage/internal/admin"
	"skyimage/internal/files"
	"skyimage/internal/middleware"
	"skyimage/internal/turnstile"
	"skyimage/internal/users"
)

func (s *Server) registerAdminRoutes(r *gin.RouterGroup) {
	adminGroup := r.Group("/admin")
	adminGroup.Use(s.authMiddleware(), middleware.RequireAdmin())
	adminGroup.GET("/metrics", s.handleAdminMetrics)
	adminGroup.GET("/settings", s.handleAdminSettings)
	adminGroup.PUT("/settings", s.handleAdminUpdateSettings)
	adminGroup.GET("/users", s.handleAdminUsers)
	adminGroup.GET("/users/:id", s.handleAdminGetUser)
	adminGroup.POST("/users", s.handleAdminCreateUser)
	adminGroup.DELETE("/users/:id", s.handleAdminDeleteUser)
	adminGroup.PATCH("/users/:id/status", s.handleAdminUpdateStatus)
	adminGroup.POST("/users/:id/admin", s.handleAdminToggleAdmin)
	adminGroup.PATCH("/users/:id/group", s.handleAdminAssignUserGroup)

	adminGroup.GET("/groups", s.handleAdminListGroups)
	adminGroup.POST("/groups", s.handleAdminCreateGroup)
	adminGroup.PUT("/groups/:id", s.handleAdminUpdateGroup)
	adminGroup.DELETE("/groups/:id", s.handleAdminDeleteGroup)

	adminGroup.GET("/strategies", s.handleAdminListStrategies)
	adminGroup.POST("/strategies", s.handleAdminCreateStrategy)
	adminGroup.PUT("/strategies/:id", s.handleAdminUpdateStrategy)
	adminGroup.DELETE("/strategies/:id", s.handleAdminDeleteStrategy)

	adminGroup.GET("/images", s.handleAdminImages)
	adminGroup.DELETE("/images/:id", s.handleAdminDeleteImage)

	adminGroup.GET("/system", s.handleAdminSystemSettings)
	adminGroup.PUT("/system", s.handleAdminUpdateSystemSettings)
	adminGroup.POST("/system/test-smtp", s.handleAdminTestSMTP)
	adminGroup.POST("/system/test-turnstile", s.handleAdminTestTurnstile)
}

func (s *Server) handleAdminMetrics(c *gin.Context) {
	metrics, err := s.admin.Dashboard(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": metrics})
}

func (s *Server) handleAdminUsers(c *gin.Context) {
	users, err := s.users.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": users})
}

func (s *Server) handleAdminGetUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	user, err := s.users.FindByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func (s *Server) handleAdminUpdateStatus(c *gin.Context) {
	actor, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload struct {
		Status uint8 `json:"status"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.users.UpdateStatus(c.Request.Context(), actor, uint(id), payload.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}

func (s *Server) handleAdminToggleAdmin(c *gin.Context) {
	actor, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload struct {
		Admin bool `json:"admin"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.users.ToggleAdmin(c.Request.Context(), actor, uint(id), payload.Admin); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}

func (s *Server) handleAdminAssignUserGroup(c *gin.Context) {
	actor, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload struct {
		GroupID *uint `json:"groupId"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, err := s.users.AssignGroup(c.Request.Context(), actor, uint(id), payload.GroupID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func (s *Server) handleAdminCreateUser(c *gin.Context) {
	actor, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
		return
	}
	var payload users.CreateUserInput
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, err := s.users.CreateUser(c.Request.Context(), actor, payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func (s *Server) handleAdminDeleteUser(c *gin.Context) {
	actor, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := s.users.DeleteUser(c.Request.Context(), actor, uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleAdminListGroups(c *gin.Context) {
	groups, err := s.admin.ListGroups(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": groups})
}

func (s *Server) handleAdminCreateGroup(c *gin.Context) {
	var payload admin.GroupPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group, err := s.admin.CreateGroup(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": group})
}

func (s *Server) handleAdminUpdateGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload admin.GroupPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	group, err := s.admin.UpdateGroup(c.Request.Context(), uint(id), payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": group})
}

func (s *Server) handleAdminDeleteGroup(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := s.admin.DeleteGroup(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleAdminListStrategies(c *gin.Context) {
	items, err := s.admin.ListStrategies(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (s *Server) handleAdminCreateStrategy(c *gin.Context) {
	var payload admin.StrategyPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item, err := s.admin.CreateStrategy(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (s *Server) handleAdminUpdateStrategy(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload admin.StrategyPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item, err := s.admin.UpdateStrategy(c.Request.Context(), uint(id), payload)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (s *Server) handleAdminDeleteStrategy(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := s.admin.DeleteStrategy(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleAdminImages(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	filesList, err := s.admin.ListAllFiles(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dtos := make([]files.FileDTO, 0, len(filesList))
	for _, file := range filesList {
		dto, err := s.files.ToDTO(c.Request.Context(), file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		dtos = append(dtos, dto)
	}
	c.JSON(http.StatusOK, gin.H{"data": dtos})
}

func (s *Server) handleAdminDeleteImage(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := s.files.DeleteByAdmin(c.Request.Context(), uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleAdminSettings(c *gin.Context) {
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": settings})
}

func (s *Server) handleAdminUpdateSettings(c *gin.Context) {
	var payload map[string]string
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.admin.UpdateSettings(c.Request.Context(), payload); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "ok"})
}

type systemSettingsPayload struct {
	SiteTitle               string `json:"siteTitle"`
	SiteDescription         string `json:"siteDescription"`
	About                   string `json:"about"`
	EnableGallery           bool   `json:"enableGallery"`
	EnableApi               bool   `json:"enableApi"`
	AllowRegistration       bool   `json:"allowRegistration"`
	SMTPHost                string `json:"smtpHost"`
	SMTPPort                string `json:"smtpPort"`
	SMTPUsername            string `json:"smtpUsername"`
	SMTPPassword            string `json:"smtpPassword"`
	SMTPSecure              bool   `json:"smtpSecure"`
	EnableRegisterVerify    bool   `json:"enableRegisterVerify"`
	EnableLoginNotification bool   `json:"enableLoginNotification"`
	TurnstileSiteKey        string `json:"turnstileSiteKey"`
	TurnstileSecretKey      string `json:"turnstileSecretKey"`
	EnableTurnstile         bool   `json:"enableTurnstile"`
	AccountDisabledNotice   string `json:"accountDisabledNotice"`
}

type systemSettingsResponse struct {
	systemSettingsPayload
	TurnstileVerified       bool   `json:"turnstileVerified"`
	TurnstileLastVerifiedAt string `json:"turnstileLastVerifiedAt,omitempty"`
}

func (s *Server) handleAdminSystemSettings(c *gin.Context) {
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	disabledNotice := settings["account.disabled_notice"]
	if strings.TrimSpace(disabledNotice) == "" {
		disabledNotice = defaultAccountDisabledNotice
	}
	payload := systemSettingsResponse{
		systemSettingsPayload: systemSettingsPayload{
			SiteTitle:               settings["site.title"],
			SiteDescription:         settings["site.description"],
			About:                   settings["site.about"],
			EnableGallery:           settings["features.gallery"] != "false",
			EnableApi:               settings["features.api"] != "false",
			AllowRegistration:       settings["features.allow_registration"] != "false",
			SMTPHost:                settings["mail.smtp.host"],
			SMTPPort:                settings["mail.smtp.port"],
			SMTPUsername:            settings["mail.smtp.username"],
			SMTPPassword:            settings["mail.smtp.password"],
			SMTPSecure:              settings["mail.smtp.secure"] == "true",
			EnableRegisterVerify:    settings["mail.register.verify"] == "true",
			EnableLoginNotification: settings["mail.login.notification"] == "true",
			TurnstileSiteKey:        settings["turnstile.site_key"],
			TurnstileSecretKey:      settings["turnstile.secret_key"],
			EnableTurnstile:         settings["turnstile.enabled"] == "true",
			AccountDisabledNotice:   disabledNotice,
		},
		TurnstileLastVerifiedAt: settings["turnstile.last_verified_at"],
	}
	expectedSig := turnstile.GenerateSignature(payload.TurnstileSiteKey, payload.TurnstileSecretKey)
	storedSig := settings["turnstile.last_verified_signature"]
	if expectedSig != "" && storedSig == expectedSig {
		payload.TurnstileVerified = true
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

func (s *Server) handleAdminUpdateSystemSettings(c *gin.Context) {
	var payload systemSettingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	newSignature := turnstile.GenerateSignature(payload.TurnstileSiteKey, payload.TurnstileSecretKey)
	if payload.EnableTurnstile {
		if payload.TurnstileSiteKey == "" || payload.TurnstileSecretKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "启用 Turnstile 时必须填写 Site Key 和 Secret Key"})
			return
		}
		if newSignature == "" || settings["turnstile.last_verified_signature"] != newSignature {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先点击“测试 Turnstile”并验证成功后再启用登录/注册人机验证"})
			return
		}
	}
	notice := strings.TrimSpace(payload.AccountDisabledNotice)
	if notice == "" {
		notice = defaultAccountDisabledNotice
	}
	values := map[string]string{
		"site.title":                 payload.SiteTitle,
		"site.description":           payload.SiteDescription,
		"site.about":                 payload.About,
		"features.gallery":           strconv.FormatBool(payload.EnableGallery),
		"features.api":               strconv.FormatBool(payload.EnableApi),
		"features.allow_registration": strconv.FormatBool(payload.AllowRegistration),
		"mail.smtp.host":             payload.SMTPHost,
		"mail.smtp.port":             payload.SMTPPort,
		"mail.smtp.username":         payload.SMTPUsername,
		"mail.smtp.password":         payload.SMTPPassword,
		"mail.smtp.secure":           strconv.FormatBool(payload.SMTPSecure),
		"mail.register.verify":       strconv.FormatBool(payload.EnableRegisterVerify),
		"mail.login.notification":    strconv.FormatBool(payload.EnableLoginNotification),
		"turnstile.site_key":         payload.TurnstileSiteKey,
		"turnstile.secret_key":       payload.TurnstileSecretKey,
		"turnstile.enabled":          strconv.FormatBool(payload.EnableTurnstile),
		"account.disabled_notice":    notice,
	}
	if settings["turnstile.last_verified_signature"] != newSignature {
		values["turnstile.last_verified_signature"] = ""
		values["turnstile.last_verified_at"] = ""
	}
	if err := s.admin.UpdateSettings(c.Request.Context(), values); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}

type testTurnstilePayload struct {
	SiteKey   string `json:"siteKey" binding:"required"`
	SecretKey string `json:"secretKey" binding:"required"`
	Token     string `json:"token" binding:"required"`
}

func (s *Server) handleAdminTestTurnstile(c *gin.Context) {
	var payload testTurnstilePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先填写完整的 Turnstile 配置信息并通过验证"})
		return
	}
	ok, err := s.turnstile.VerifyWithSecret(c.Request.Context(), payload.Token, c.ClientIP(), payload.SecretKey)
	if err != nil || !ok {
		message := "Turnstile 验证失败"
		if err != nil {
			message = err.Error()
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{
			"success": false,
			"message": message,
		}})
		return
	}
	signature := turnstile.GenerateSignature(payload.SiteKey, payload.SecretKey)
	now := time.Now().UTC().Format(time.RFC3339)
	if err := s.admin.UpdateSettings(c.Request.Context(), map[string]string{
		"turnstile.last_verified_signature": signature,
		"turnstile.last_verified_at":        now,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"success":    true,
		"verifiedAt": now,
	}})
}

type testSMTPPayload struct {
	TestEmail    string `json:"testEmail" binding:"required,email"`
	SMTPHost     string `json:"smtpHost" binding:"required"`
	SMTPPort     string `json:"smtpPort" binding:"required"`
	SMTPUsername string `json:"smtpUsername" binding:"required"`
	SMTPPassword string `json:"smtpPassword"`
	SMTPSecure   bool   `json:"smtpSecure"`
}

func (s *Server) handleAdminTestSMTP(c *gin.Context) {
	var payload testSMTPPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的邮件配置信息"})
		return
	}

	// 构建邮件内容
	from := payload.SMTPUsername
	to := []string{payload.TestEmail}
	subject := "skyImage邮件测试"
	body := "如果你看到这条消息代表邮件已正常可用"

	// 构建邮件消息（符合 RFC 5322 标准）
	message := []byte("From: " + from + "\r\n" +
		"To: " + payload.TestEmail + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" +
		body + "\r\n")

	// 构建认证
	auth := smtp.PlainAuth("", payload.SMTPUsername, payload.SMTPPassword, payload.SMTPHost)

	// 发送邮件
	addr := payload.SMTPHost + ":" + payload.SMTPPort

	if payload.SMTPSecure {
		// 使用 TLS
		tlsConfig := &tls.Config{
			ServerName: payload.SMTPHost,
		}

		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "连接 SMTP 服务器失败: " + err.Error(),
				},
			})
			return
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, payload.SMTPHost)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "创建 SMTP 客户端失败: " + err.Error(),
				},
			})
			return
		}
		defer client.Close()

		if err = client.Auth(auth); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "SMTP 认证失败: " + err.Error(),
				},
			})
			return
		}

		if err = client.Mail(from); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "设置发件人失败: " + err.Error(),
				},
			})
			return
		}

		for _, rcpt := range to {
			if err = client.Rcpt(rcpt); err != nil {
				c.JSON(http.StatusOK, gin.H{
					"data": gin.H{
						"success": false,
						"message": "设置收件人失败: " + err.Error(),
					},
				})
				return
			}
		}

		w, err := client.Data()
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "准备邮件数据失败: " + err.Error(),
				},
			})
			return
		}

		if _, err = w.Write(message); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "写入邮件数据失败: " + err.Error(),
				},
			})
			return
		}

		if err = w.Close(); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "关闭邮件数据流失败: " + err.Error(),
				},
			})
			return
		}

		client.Quit()
	} else {
		// 不使用 TLS
		err := smtp.SendMail(addr, auth, from, to, message)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"data": gin.H{
					"success": false,
					"message": "发送邮件失败: " + err.Error(),
				},
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"success": true,
			"message": "测试邮件发送成功",
		},
	})
}
