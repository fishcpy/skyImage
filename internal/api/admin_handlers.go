package api

import (
	"crypto/tls"
	"errors"
	"io"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"skyimage/internal/admin"
	"skyimage/internal/captcha"
	"skyimage/internal/files"
	mailservice "skyimage/internal/mail"
	"skyimage/internal/middleware"
	"skyimage/internal/notifications"
	"skyimage/internal/users"
)

const defaultConsoleURL = "http://localhost:8080"

func (s *Server) registerAdminRoutes(r *gin.RouterGroup) {
	adminGroup := r.Group("/admin")
	adminGroup.Use(s.authMiddleware(), middleware.RequireAdmin(), middleware.RequireCSRF())
	adminGroup.GET("/metrics", s.handleAdminMetrics)
	adminGroup.GET("/trends", s.handleAdminTrends)
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
	adminGroup.GET("/audits", s.handleAdminListAuditProfiles)
	adminGroup.POST("/audits", s.handleAdminCreateAuditProfile)
	adminGroup.PUT("/audits/:id", s.handleAdminUpdateAuditProfile)
	adminGroup.DELETE("/audits/:id", s.handleAdminDeleteAuditProfile)

	adminGroup.GET("/images", s.handleAdminImages)
	adminGroup.DELETE("/images/:id", s.handleAdminDeleteImage)
	adminGroup.PATCH("/images/:id/visibility", s.handleAdminUpdateImageVisibility)
	adminGroup.PATCH("/images/:id/audit-status", s.handleAdminUpdateImageAuditStatus)
	adminGroup.PATCH("/images/batch/visibility", s.handleAdminBatchUpdateImageVisibility)
	adminGroup.POST("/images/batch/delete", s.handleAdminBatchDeleteImages)

	adminGroup.GET("/system/site", s.handleAdminSiteSettings)
	adminGroup.PUT("/system/site", s.handleAdminUpdateSiteSettings)
	adminGroup.GET("/system/general", s.handleAdminGeneralSettings)
	adminGroup.PUT("/system/general", s.handleAdminUpdateGeneralSettings)
	adminGroup.GET("/system/email", s.handleAdminEmailSettings)
	adminGroup.PUT("/system/email", s.handleAdminUpdateEmailSettings)
	adminGroup.POST("/system/email/test", s.handleAdminTestSMTP)
	adminGroup.GET("/system/captcha", s.handleAdminCaptchaSettings)
	adminGroup.PUT("/system/captcha", s.handleAdminUpdateCaptchaSettings)
	adminGroup.POST("/system/captcha/test-turnstile", s.handleAdminTestTurnstile)
	adminGroup.POST("/system/captcha/test", s.handleAdminTestCaptcha)
}

func requireSuperAdmin(c *gin.Context) bool {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
		return false
	}
	if !user.IsSuperAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "super admin required"})
		return false
	}
	return true
}

func redactSettings(settings map[string]string) map[string]string {
	if len(settings) == 0 {
		return settings
	}
	redacted := make(map[string]string, len(settings))
	for key, value := range settings {
		redacted[key] = value
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "mail.smtp.password", "turnstile.secret_key", "turnstile.last_verified_signature",
			"captcha.cloudflare.secret_key", "captcha.cloudflare.last_verified_signature",
			"captcha.geetest.captcha_key", "captcha.geetest.last_verified_signature":
			redacted[key] = "***"
		}
	}
	return redacted
}

// redactSecret returns "***" for non-empty secrets, empty string otherwise.
func redactSecret(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return "***"
}

func (s *Server) handleAdminMetrics(c *gin.Context) {
	metrics, err := s.admin.Dashboard(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": metrics})
}

func (s *Server) handleAdminTrends(c *gin.Context) {
	days := 90
	if daysParam := c.Query("days"); daysParam != "" {
		if parsedDays, err := strconv.Atoi(daysParam); err == nil && parsedDays > 0 {
			days = parsedDays
		}
	}

	trends, err := s.admin.GetTrends(c.Request.Context(), days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": trends})
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
	existing, err := s.admin.FindStrategyByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	var payload admin.StrategyPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.files.FreezePublicURLsForStrategy(c.Request.Context(), existing); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

func (s *Server) handleAdminListAuditProfiles(c *gin.Context) {
	items, err := s.admin.ListAuditProfiles(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func (s *Server) handleAdminCreateAuditProfile(c *gin.Context) {
	var payload admin.AuditProfilePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item, err := s.admin.CreateAuditProfile(c.Request.Context(), payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (s *Server) handleAdminUpdateAuditProfile(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload admin.AuditProfilePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	item, err := s.admin.UpdateAuditProfile(c.Request.Context(), uint(id), payload)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

func (s *Server) handleAdminDeleteAuditProfile(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	err = s.admin.DeleteAuditProfile(c.Request.Context(), uint(id))
	if err != nil {
		statusCode := http.StatusInternalServerError
		if errors.Is(err, admin.ErrAuditProfileInUse) {
			statusCode = http.StatusBadRequest
		}
		c.JSON(statusCode, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleAdminImages(c *gin.Context) {
	limit, offset := parsePagination(c, 50, 100)
	auditStatus := strings.TrimSpace(c.Query("auditStatus"))
	filesList, err := s.admin.ListAllFiles(c.Request.Context(), limit, offset, auditStatus)
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
	var payload struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil && err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.files.DeleteByAdmin(c.Request.Context(), uint(id), payload.Reason); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleAdminUpdateImageVisibility(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload struct {
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	file, err := s.files.UpdateVisibilityByAdmin(c.Request.Context(), uint(id), payload.Visibility)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dto, err := s.files.ToDTO(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": dto})
}

func (s *Server) handleAdminUpdateImageAuditStatus(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var payload struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	file, err := s.files.UpdateAuditStatusByAdmin(c.Request.Context(), uint(id), payload.Status)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dto, err := s.files.ToDTO(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": dto})
}

func (s *Server) handleAdminBatchUpdateImageVisibility(c *gin.Context) {
	var payload struct {
		IDs        []uint `json:"ids"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := s.files.UpdateVisibilityByAdminBatch(c.Request.Context(), payload.IDs, payload.Visibility)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": updated}})
}

func (s *Server) handleAdminBatchDeleteImages(c *gin.Context) {
	var payload struct {
		IDs    []uint `json:"ids"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	deleted, err := s.files.DeleteByAdminBatch(c.Request.Context(), payload.IDs, payload.Reason)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"deleted": deleted}})
}

func (s *Server) handleAdminSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": redactSettings(settings)})
}

func (s *Server) handleAdminUpdateSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
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

func normalizeImageLoadRows(raw string) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		value = 4
	}
	return normalizeImageLoadRowsValue(value)
}

func normalizeImageLoadRowsValue(value int) int {
	if value < 1 {
		return 1
	}
	if value > 20 {
		return 20
	}
	return value
}

func normalizeUserNotificationLimit(value int) int {
	return notifications.NormalizeRetentionLimitValue(value)
}

type testTurnstilePayload struct {
	SiteKey   string `json:"siteKey" binding:"required"`
	SecretKey string `json:"secretKey" binding:"required"`
	Token     string `json:"token" binding:"required"`
}

func (s *Server) handleAdminTestTurnstile(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	var payload testTurnstilePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先填写完整的 Turnstile 配置信息并通过验证"})
		return
	}
	// Use the Cloudflare service from the unified captcha service
	ok, err := s.captcha.Verify(c.Request.Context(), captcha.ProviderCloudflare, payload.Token, c.ClientIP(), nil)
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
	// Resolve "***" to actual secret key from database for signature calculation
	secretKey := strings.TrimSpace(payload.SecretKey)
	if secretKey == "***" {
		if settings, err := s.admin.GetSettings(c.Request.Context()); err == nil {
			secretKey = settings["turnstile.secret_key"]
		}
	}
	signature := captcha.GenerateSignature(payload.SiteKey, secretKey)
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
	TestEmail       string `json:"testEmail" binding:"required,email"`
	SiteTitle       string `json:"siteTitle"`
	SMTPHost        string `json:"smtpHost" binding:"required"`
	SMTPPort        string `json:"smtpPort" binding:"required"`
	SMTPUsername    string `json:"smtpUsername" binding:"required"`
	SMTPPassword    string `json:"smtpPassword"`
	SMTPFrom        string `json:"smtpFrom"`
	SMTPSecure      bool   `json:"smtpSecure"`
	MailTestSubject string `json:"mailTestSubject"`
	MailTestBody    string `json:"mailTestBody"`
}

func (s *Server) handleAdminTestSMTP(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	var payload testSMTPPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的邮件配置信息"})
		return
	}

	siteTitle := strings.TrimSpace(payload.SiteTitle)
	if siteTitle == "" {
		settings, err := s.admin.GetSettings(c.Request.Context())
		if err == nil {
			siteTitle = settings["site.title"]
		}
	}
	template := mailservice.RenderTemplateContent(
		mailservice.MergeTemplateContent(mailservice.TemplateTestSMTP, payload.MailTestSubject, payload.MailTestBody),
		mailservice.TemplateVariables{
			SiteName:  siteTitle,
			TestEmail: payload.TestEmail,
		},
	)

	// 构建邮件内容
	from := payload.SMTPFrom
	if from == "" {
		from = payload.SMTPUsername
	}
	to := []string{payload.TestEmail}
	subject := template.Subject
	body := template.Body

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

type testCaptchaPayload struct {
	Provider   string            `json:"provider" binding:"required"`
	SiteKey    string            `json:"siteKey"`
	SecretKey  string            `json:"secretKey"`
	CaptchaID  string            `json:"captchaId"`
	CaptchaKey string            `json:"captchaKey"`
	Token      string            `json:"token" binding:"required"`
	ExtraData  map[string]string `json:"extraData"`
}

func (s *Server) handleAdminTestCaptcha(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}

	var payload testCaptchaPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写完整的验证码配置信息"})
		return
	}

	provider := captcha.Provider(payload.Provider)
	config := map[string]string{}

	// Get current settings for resolving redacted secrets
	settings, _ := s.admin.GetSettings(c.Request.Context())

	if provider == captcha.ProviderCloudflare {
		secretKey := strings.TrimSpace(payload.SecretKey)
		if secretKey == "***" && settings != nil {
			secretKey = settings["captcha.cloudflare.secret_key"]
		}
		if payload.SiteKey == "" || secretKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare Turnstile 需要 Site Key 和 Secret Key"})
			return
		}
		config["secret_key"] = secretKey
	} else if provider == captcha.ProviderGeetest {
		captchaKey := strings.TrimSpace(payload.CaptchaKey)
		if captchaKey == "***" && settings != nil {
			captchaKey = settings["captcha.geetest.captcha_key"]
		}
		if payload.CaptchaID == "" || captchaKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "极验需要 Captcha ID 和 Captcha Key"})
			return
		}
		config["captcha_id"] = payload.CaptchaID
		config["captcha_key"] = captchaKey
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的验证码提供商"})
		return
	}

	ok, err := s.captcha.TestConfig(c.Request.Context(), provider, config, payload.Token, payload.ExtraData)
	if err != nil || !ok {
		message := "验证失败"
		if err != nil {
			message = err.Error()
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{
			"success": false,
			"message": message,
		}})
		return
	}

	// 保存验证通过的状态（使用解析后的真实密钥计算签名）
	now := time.Now().UTC().Format(time.RFC3339)
	settingsUpdate := map[string]string{}

	if provider == captcha.ProviderCloudflare {
		signature := captcha.GenerateSignature(payload.SiteKey, config["secret_key"])
		settingsUpdate["captcha.cloudflare.last_verified_signature"] = signature
		settingsUpdate["captcha.cloudflare.last_verified_at"] = now
	} else if provider == captcha.ProviderGeetest {
		signature := captcha.GenerateGeetestSignature(payload.CaptchaID, config["captcha_key"])
		settingsUpdate["captcha.geetest.last_verified_signature"] = signature
		settingsUpdate["captcha.geetest.last_verified_at"] = now
	}

	if err := s.admin.UpdateSettings(c.Request.Context(), settingsUpdate); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"success":    true,
		"message":    "验证成功",
		"verifiedAt": now,
	}})
}
