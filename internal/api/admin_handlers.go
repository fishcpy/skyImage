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
	"skyimage/internal/turnstile"
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

	adminGroup.GET("/system", s.handleAdminSystemSettings)
	adminGroup.PUT("/system", s.handleAdminUpdateSystemSettings)
	adminGroup.POST("/system/test-smtp", s.handleAdminTestSMTP)
	adminGroup.POST("/system/test-turnstile", s.handleAdminTestTurnstile)
	adminGroup.POST("/system/test-captcha", s.handleAdminTestCaptcha)
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
	metrics.Settings = redactSettings(metrics.Settings)
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

type systemSettingsPayload struct {
	SiteTitle                            string `json:"siteTitle"`
	ConsoleURL                           string `json:"consoleUrl"`
	SiteDescription                      string `json:"siteDescription"`
	SiteSlogan                           string `json:"siteSlogan"`
	SiteLogo                             string `json:"siteLogo"`
	About                                string `json:"about"`
	AboutTitle                           string `json:"aboutTitle"`
	NotFoundMode                         string `json:"notFoundMode"`
	NotFoundHeading                      string `json:"notFoundHeading"`
	NotFoundText                         string `json:"notFoundText"`
	NotFoundHtml                         string `json:"notFoundHtml"`
	TermsOfService                       string `json:"termsOfService"`
	PrivacyPolicy                        string `json:"privacyPolicy"`
	HomePageMode                         string `json:"homePageMode"`
	HomeCustomHTML                       string `json:"homeCustomHtml"`
	EnableGallery                        bool   `json:"enableGallery"`
	EnableHome                           bool   `json:"enableHome"`
	EnableApi                            bool   `json:"enableApi"`
	ImageLoadRows                        int    `json:"imageLoadRows"`
	AllowRegistration                    bool   `json:"allowRegistration"`
	SMTPHost                             string `json:"smtpHost"`
	SMTPPort                             string `json:"smtpPort"`
	SMTPUsername                         string `json:"smtpUsername"`
	SMTPPassword                         string `json:"smtpPassword"`
	SMTPFrom                             string `json:"smtpFrom"`
	SMTPSecure                           bool   `json:"smtpSecure"`
	MailTestSubject                      string `json:"mailTestSubject"`
	MailTestBody                         string `json:"mailTestBody"`
	MailRegisterVerifySubject            string `json:"mailRegisterVerifySubject"`
	MailRegisterVerifyBody               string `json:"mailRegisterVerifyBody"`
	MailRegisterSuccessSubject           string `json:"mailRegisterSuccessSubject"`
	MailRegisterSuccessBody              string `json:"mailRegisterSuccessBody"`
	MailLoginNotificationSubject         string `json:"mailLoginNotificationSubject"`
	MailLoginNotificationBody            string `json:"mailLoginNotificationBody"`
	MailForgotPasswordSubject            string `json:"mailForgotPasswordSubject"`
	MailForgotPasswordBody               string `json:"mailForgotPasswordBody"`
	EnableRegisterVerify                 bool   `json:"enableRegisterVerify"`
	EnableLoginNotification              bool   `json:"enableLoginNotification"`
	EnableForgotPassword                 bool   `json:"enableForgotPassword"`
	EnableForgotPasswordTurnstile        bool   `json:"enableForgotPasswordTurnstile"`
	EnableForgotPasswordTurnstileRequest bool   `json:"enableForgotPasswordTurnstileRequest"`
	EnableForgotPasswordTurnstileReset   bool   `json:"enableForgotPasswordTurnstileReset"`
	TurnstileSiteKey                     string `json:"turnstileSiteKey"`
	TurnstileSecretKey                   string `json:"turnstileSecretKey"`
	EnableTurnstile                      bool   `json:"enableTurnstile"`
	EnableLoginTurnstile                 bool   `json:"enableLoginTurnstile"`
	EnableRegisterTurnstile              bool   `json:"enableRegisterTurnstile"`
	EnableRegisterVerifyTurnstile        bool   `json:"enableRegisterVerifyTurnstile"`
	AccountDisabledNotice                string `json:"accountDisabledNotice"`
	UserNotificationLimit                int    `json:"userNotificationLimit"`
	AdminImageDeleteDefaultReason        string `json:"adminImageDeleteDefaultReason"`
	SystemAutoDeleteDefaultReason        string `json:"systemAutoDeleteDefaultReason"`
	// 新的统一验证码配置
	EnableCaptcha                        bool   `json:"enableCaptcha"`
	CaptchaProvider                      string `json:"captchaProvider"`
	CloudflareSiteKey                    string `json:"cloudflareSiteKey"`
	CloudflareSecretKey                  string `json:"cloudflareSecretKey"`
	GeetestCaptchaID                     string `json:"geetestCaptchaId"`
	GeetestCaptchaKey                    string `json:"geetestCaptchaKey"`
	EnableLoginCaptcha                   bool   `json:"enableLoginCaptcha"`
	EnableRegisterCaptcha                bool   `json:"enableRegisterCaptcha"`
	EnableRegisterVerifyCaptcha          bool   `json:"enableRegisterVerifyCaptcha"`
	EnableForgotPasswordRequestCaptcha   bool   `json:"enableForgotPasswordRequestCaptcha"`
	EnableForgotPasswordResetCaptcha     bool   `json:"enableForgotPasswordResetCaptcha"`
}

type systemSettingsResponse struct {
	systemSettingsPayload
	TurnstileVerified          bool   `json:"turnstileVerified"`
	TurnstileLastVerifiedAt    string `json:"turnstileLastVerifiedAt,omitempty"`
	CloudflareVerified         bool   `json:"cloudflareVerified"`
	CloudflareLastVerifiedAt   string `json:"cloudflareLastVerifiedAt,omitempty"`
	GeetestVerified            bool   `json:"geetestVerified"`
	GeetestLastVerifiedAt      string `json:"geetestLastVerifiedAt,omitempty"`
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

func (s *Server) handleAdminSystemSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	consoleURL := strings.TrimSpace(settings["site.console_url"])
	if consoleURL == "" {
		consoleURL = defaultConsoleURL
	}
	disabledNotice := settings["account.disabled_notice"]
	if strings.TrimSpace(disabledNotice) == "" {
		disabledNotice = defaultAccountDisabledNotice
	}
	homePageMode := strings.TrimSpace(settings["site.home_page_mode"])
	if homePageMode != "custom_html" {
		homePageMode = "default"
	}
	homeCustomHTML := ""
	if homePageMode == "custom_html" {
		homeCustomHTML = settings["site.home_custom_html"]
	}
	payload := systemSettingsResponse{
		systemSettingsPayload: systemSettingsPayload{
			SiteTitle:                            settings["site.title"],
			ConsoleURL:                           consoleURL,
			SiteDescription:                      settings["site.description"],
			SiteSlogan:                           settings["site.slogan"],
			SiteLogo:                             settings["site.logo"],
			About:                                settings["site.about"],
			AboutTitle:                           settings["site.about_title"],
			NotFoundMode:                         settings["site.notfound_mode"],
			NotFoundHeading:                      settings["site.notfound_heading"],
			NotFoundText:                         settings["site.notfound_text"],
			NotFoundHtml:                         settings["site.notfound_html"],
			TermsOfService:                       settings["site.terms_of_service"],
			PrivacyPolicy:                        settings["site.privacy_policy"],
			HomePageMode:                         homePageMode,
			HomeCustomHTML:                       homeCustomHTML,
			EnableGallery:                        settings["features.gallery"] != "false",
			EnableHome:                           settings["features.home"] != "false",
			EnableApi:                            settings["features.api"] != "false",
			ImageLoadRows:                        normalizeImageLoadRows(settings["images.load_rows"]),
			AllowRegistration:                    settings["features.allow_registration"] != "false",
			SMTPHost:                             settings["mail.smtp.host"],
			SMTPPort:                             settings["mail.smtp.port"],
			SMTPUsername:                         settings["mail.smtp.username"],
			SMTPPassword:                         redactSecret(settings["mail.smtp.password"]),
		SMTPFrom:                             settings["mail.smtp.from"],
		SMTPSecure:                           settings["mail.smtp.secure"] == "true",
		MailTestSubject:                      settings["mail.template.test.subject"],
		MailTestBody:                         settings["mail.template.test.body"],
		MailRegisterVerifySubject:            settings["mail.template.register_verify.subject"],
		MailRegisterVerifyBody:               settings["mail.template.register_verify.body"],
		MailRegisterSuccessSubject:           settings["mail.template.register_success.subject"],
		MailRegisterSuccessBody:              settings["mail.template.register_success.body"],
		MailLoginNotificationSubject:         settings["mail.template.login_notification.subject"],
		MailLoginNotificationBody:            settings["mail.template.login_notification.body"],
		MailForgotPasswordSubject:            settings["mail.template.forgot_password.subject"],
		MailForgotPasswordBody:               settings["mail.template.forgot_password.body"],
		EnableRegisterVerify:                 settings["mail.register.verify"] == "true",
		EnableLoginNotification:              settings["mail.login.notification"] == "true",
		EnableForgotPassword:                 settings["mail.forgot_password.enabled"] == "true",
		EnableForgotPasswordTurnstile:        settings["mail.forgot_password.turnstile"] == "true",
		EnableForgotPasswordTurnstileRequest: settings["mail.forgot_password.turnstile_request"] == "true",
		EnableForgotPasswordTurnstileReset:   settings["mail.forgot_password.turnstile_reset"] == "true",
		TurnstileSiteKey:                     settings["turnstile.site_key"],
		TurnstileSecretKey:                   redactSecret(settings["turnstile.secret_key"]),
			EnableTurnstile:                      settings["turnstile.enabled"] == "true",
			EnableLoginTurnstile:                 settings["turnstile.login"] == "true",
			EnableRegisterTurnstile:              settings["turnstile.register"] == "true",
			EnableRegisterVerifyTurnstile:        settings["turnstile.register_verify"] == "true",
			AccountDisabledNotice:                disabledNotice,
			UserNotificationLimit:                notifications.NormalizeRetentionLimit(settings[notifications.ConfigUserRetentionLimit]),
			AdminImageDeleteDefaultReason:        notifications.NormalizeAdminDeleteReason(settings[notifications.ConfigAdminImageDeleteReason]),
			SystemAutoDeleteDefaultReason:        notifications.NormalizeSystemAutoDeleteReason(settings[notifications.ConfigSystemAutoDeleteReason]),
			// 新的统一验证码配置
			EnableCaptcha:                      settings["captcha.enabled"] == "true",
			CaptchaProvider:                    settings["captcha.provider"],
			CloudflareSiteKey:                  settings["captcha.cloudflare.site_key"],
			CloudflareSecretKey:                redactSecret(settings["captcha.cloudflare.secret_key"]),
			GeetestCaptchaID:                   settings["captcha.geetest.captcha_id"],
			GeetestCaptchaKey:                  redactSecret(settings["captcha.geetest.captcha_key"]),
			EnableLoginCaptcha:                 settings["captcha.login"] == "true",
			EnableRegisterCaptcha:              settings["captcha.register"] == "true",
			EnableRegisterVerifyCaptcha:        settings["captcha.register_verify"] == "true",
			EnableForgotPasswordRequestCaptcha: settings["captcha.forgot_password_request"] == "true",
			EnableForgotPasswordResetCaptcha:   settings["captcha.forgot_password_reset"] == "true",
		},
		TurnstileLastVerifiedAt: settings["turnstile.last_verified_at"],
		CloudflareLastVerifiedAt: settings["captcha.cloudflare.last_verified_at"],
		GeetestLastVerifiedAt: settings["captcha.geetest.last_verified_at"],
	}
	// 检查 Cloudflare 验证状态
	cloudflareExpectedSig := captcha.GenerateSignature(payload.CloudflareSiteKey, settings["captcha.cloudflare.secret_key"])
	cloudflareStoredSig := settings["captcha.cloudflare.last_verified_signature"]
	if cloudflareExpectedSig != "" && cloudflareStoredSig == cloudflareExpectedSig {
		payload.CloudflareVerified = true
	}
	// 检查 Geetest 验证状态
	geetestExpectedSig := captcha.GenerateGeetestSignature(payload.GeetestCaptchaID, settings["captcha.geetest.captcha_key"])
	geetestStoredSig := settings["captcha.geetest.last_verified_signature"]
	if geetestExpectedSig != "" && geetestStoredSig == geetestExpectedSig {
		payload.GeetestVerified = true
	}
	// 兼容旧的 Turnstile 验证状态
	expectedSig := turnstile.GenerateSignature(payload.TurnstileSiteKey, settings["turnstile.secret_key"])
	storedSig := settings["turnstile.last_verified_signature"]
	if expectedSig != "" && storedSig == expectedSig {
		payload.TurnstileVerified = true
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

func (s *Server) handleAdminUpdateSystemSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
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
	smtpPassword := strings.TrimSpace(payload.SMTPPassword)
	if smtpPassword == "" || smtpPassword == "***" {
		smtpPassword = settings["mail.smtp.password"]
	}
	turnstileSecretKey := strings.TrimSpace(payload.TurnstileSecretKey)
	if turnstileSecretKey == "" || turnstileSecretKey == "***" {
		turnstileSecretKey = settings["turnstile.secret_key"]
	}
	newSignature := turnstile.GenerateSignature(payload.TurnstileSiteKey, turnstileSecretKey)
	currentTurnstileEnabled := settings["turnstile.enabled"] == "true"
	currentTurnstileSiteKey := settings["turnstile.site_key"]
	currentTurnstileSecretKey := settings["turnstile.secret_key"]
	turnstileConfigChanged := payload.TurnstileSiteKey != currentTurnstileSiteKey || turnstileSecretKey != currentTurnstileSecretKey
	enablingTurnstileNow := payload.EnableTurnstile && !currentTurnstileEnabled
	requireTurnstileVerification := payload.EnableTurnstile && (enablingTurnstileNow || turnstileConfigChanged)
	if requireTurnstileVerification {
		if payload.TurnstileSiteKey == "" || turnstileSecretKey == "" {
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
	homePageMode := strings.TrimSpace(payload.HomePageMode)
	if homePageMode != "custom_html" {
		homePageMode = "default"
	}
	homeCustomHTML := ""
	if homePageMode == "custom_html" {
		homeCustomHTML = payload.HomeCustomHTML
	}
	adminDeleteReason := notifications.NormalizeAdminDeleteReason(payload.AdminImageDeleteDefaultReason)
	systemAutoDeleteReason := notifications.NormalizeSystemAutoDeleteReason(payload.SystemAutoDeleteDefaultReason)

	// 处理统一验证码配置的密钥
	cloudflareSecretKey := strings.TrimSpace(payload.CloudflareSecretKey)
	if cloudflareSecretKey == "" || cloudflareSecretKey == "***" {
		cloudflareSecretKey = settings["captcha.cloudflare.secret_key"]
	}
	geetestCaptchaKey := strings.TrimSpace(payload.GeetestCaptchaKey)
	if geetestCaptchaKey == "" || geetestCaptchaKey == "***" {
		geetestCaptchaKey = settings["captcha.geetest.captcha_key"]
	}

	// 检查统一验证码配置是否变更
	currentCloudflareSiteKey := settings["captcha.cloudflare.site_key"]
	currentCloudflareSecretKey := settings["captcha.cloudflare.secret_key"]
	currentGeetestCaptchaID := settings["captcha.geetest.captcha_id"]
	currentGeetestCaptchaKey := settings["captcha.geetest.captcha_key"]

	cloudflareConfigChanged := payload.CloudflareSiteKey != currentCloudflareSiteKey || cloudflareSecretKey != currentCloudflareSecretKey
	geetestConfigChanged := payload.GeetestCaptchaID != currentGeetestCaptchaID || geetestCaptchaKey != currentGeetestCaptchaKey

	// 当验证码启用时，检查所选提供商是否已验证
	if payload.EnableCaptcha {
		if payload.CaptchaProvider == "cloudflare" {
			if payload.CloudflareSiteKey == "" || cloudflareSecretKey == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "使用 Cloudflare 验证时必须填写 Site Key 和 Secret Key"})
				return
			}
			newCloudflareSig := captcha.GenerateSignature(payload.CloudflareSiteKey, cloudflareSecretKey)
			if newCloudflareSig == "" || settings["captcha.cloudflare.last_verified_signature"] != newCloudflareSig {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare 配置已变更或未验证，请先点击测试并验证成功后再保存"})
				return
			}
		} else if payload.CaptchaProvider == "geetest" {
			if payload.GeetestCaptchaID == "" || geetestCaptchaKey == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "使用极验验证时必须填写 Captcha ID 和 Captcha Key"})
				return
			}
			newGeetestSig := captcha.GenerateGeetestSignature(payload.GeetestCaptchaID, geetestCaptchaKey)
			if newGeetestSig == "" || settings["captcha.geetest.last_verified_signature"] != newGeetestSig {
				c.JSON(http.StatusBadRequest, gin.H{"error": "极验配置已变更或未验证，请先点击测试并验证成功后再保存"})
				return
			}
		}
	}

	values := map[string]string{
		"site.title":                               payload.SiteTitle,
		"site.console_url":                         payload.ConsoleURL,
		"site.description":                         payload.SiteDescription,
		"site.slogan":                              payload.SiteSlogan,
		"site.logo":                                payload.SiteLogo,
		"site.about":                               payload.About,
		"site.about_title":                         payload.AboutTitle,
		"site.notfound_mode":                       payload.NotFoundMode,
		"site.notfound_heading":                    payload.NotFoundHeading,
		"site.notfound_text":                       payload.NotFoundText,
		"site.notfound_html":                       payload.NotFoundHtml,
		"site.terms_of_service":                    payload.TermsOfService,
		"site.privacy_policy":                      payload.PrivacyPolicy,
		"site.home_page_mode":                      homePageMode,
		"site.home_custom_html":                    homeCustomHTML,
		"features.gallery":                         strconv.FormatBool(payload.EnableGallery),
		"features.home":                            strconv.FormatBool(payload.EnableHome),
		"features.api":                             strconv.FormatBool(payload.EnableApi),
		"images.load_rows":                         strconv.Itoa(normalizeImageLoadRowsValue(payload.ImageLoadRows)),
		"features.allow_registration":              strconv.FormatBool(payload.AllowRegistration),
		"mail.smtp.host":                           payload.SMTPHost,
		"mail.smtp.port":                           payload.SMTPPort,
		"mail.smtp.username":                       payload.SMTPUsername,
		"mail.smtp.password":                       smtpPassword,
		"mail.smtp.from":                           payload.SMTPFrom,
		"mail.smtp.secure":                         strconv.FormatBool(payload.SMTPSecure),
		"mail.template.test.subject":               payload.MailTestSubject,
		"mail.template.test.body":                  payload.MailTestBody,
		"mail.template.register_verify.subject":    payload.MailRegisterVerifySubject,
		"mail.template.register_verify.body":       payload.MailRegisterVerifyBody,
		"mail.template.register_success.subject":   payload.MailRegisterSuccessSubject,
		"mail.template.register_success.body":      payload.MailRegisterSuccessBody,
		"mail.template.login_notification.subject": payload.MailLoginNotificationSubject,
		"mail.template.login_notification.body":    payload.MailLoginNotificationBody,
		"mail.template.forgot_password.subject":    payload.MailForgotPasswordSubject,
		"mail.template.forgot_password.body":       payload.MailForgotPasswordBody,
		"mail.register.verify":                     strconv.FormatBool(payload.EnableRegisterVerify),
		"mail.login.notification":                  strconv.FormatBool(payload.EnableLoginNotification),
		"mail.forgot_password.enabled":             strconv.FormatBool(payload.EnableForgotPassword),
		"mail.forgot_password.turnstile":           strconv.FormatBool(payload.EnableForgotPasswordTurnstile),
		"mail.forgot_password.turnstile_request":   strconv.FormatBool(payload.EnableForgotPasswordTurnstileRequest),
		"mail.forgot_password.turnstile_reset":     strconv.FormatBool(payload.EnableForgotPasswordTurnstileReset),
		"turnstile.site_key":                       payload.TurnstileSiteKey,
		"turnstile.secret_key":                     turnstileSecretKey,
		"turnstile.enabled":                        strconv.FormatBool(payload.EnableTurnstile),
		"turnstile.login":                          strconv.FormatBool(payload.EnableLoginTurnstile),
		"turnstile.register":                       strconv.FormatBool(payload.EnableRegisterTurnstile),
		"turnstile.register_verify":                strconv.FormatBool(payload.EnableRegisterVerifyTurnstile),
		"account.disabled_notice":                  notice,
		notifications.ConfigUserRetentionLimit:     strconv.Itoa(normalizeUserNotificationLimit(payload.UserNotificationLimit)),
		notifications.ConfigAdminImageDeleteReason: adminDeleteReason,
		notifications.ConfigSystemAutoDeleteReason: systemAutoDeleteReason,
		// 新的统一验证码配置
		"captcha.enabled":                 strconv.FormatBool(payload.EnableCaptcha),
		"captcha.provider":                payload.CaptchaProvider,
		"captcha.cloudflare.site_key":     payload.CloudflareSiteKey,
		"captcha.cloudflare.secret_key":   cloudflareSecretKey,
		"captcha.geetest.captcha_id":      payload.GeetestCaptchaID,
		"captcha.geetest.captcha_key":     geetestCaptchaKey,
		"captcha.login":                   strconv.FormatBool(payload.EnableLoginCaptcha),
		"captcha.register":                strconv.FormatBool(payload.EnableRegisterCaptcha),
		"captcha.register_verify":         strconv.FormatBool(payload.EnableRegisterVerifyCaptcha),
		"captcha.forgot_password_request": strconv.FormatBool(payload.EnableForgotPasswordRequestCaptcha),
		"captcha.forgot_password_reset":   strconv.FormatBool(payload.EnableForgotPasswordResetCaptcha),
	}
	if settings["turnstile.last_verified_signature"] != newSignature {
		values["turnstile.last_verified_signature"] = ""
		values["turnstile.last_verified_at"] = ""
	}
	// Cloudflare 配置变更时清除验证状态
	if cloudflareConfigChanged {
		values["captcha.cloudflare.last_verified_signature"] = ""
		values["captcha.cloudflare.last_verified_at"] = ""
	}
	// Geetest 配置变更时清除验证状态
	if geetestConfigChanged {
		values["captcha.geetest.last_verified_signature"] = ""
		values["captcha.geetest.last_verified_at"] = ""
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
	signature := captcha.GenerateSignature(payload.SiteKey, payload.SecretKey)
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

	if provider == captcha.ProviderCloudflare {
		if payload.SiteKey == "" || payload.SecretKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Cloudflare Turnstile 需要 Site Key 和 Secret Key"})
			return
		}
		config["secret_key"] = payload.SecretKey
	} else if provider == captcha.ProviderGeetest {
		if payload.CaptchaID == "" || payload.CaptchaKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "极验需要 Captcha ID 和 Captcha Key"})
			return
		}
		config["captcha_id"] = payload.CaptchaID
		config["captcha_key"] = payload.CaptchaKey
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

	// 保存验证通过的状态
	now := time.Now().UTC().Format(time.RFC3339)
	settingsUpdate := map[string]string{}

	if provider == captcha.ProviderCloudflare {
		signature := captcha.GenerateSignature(payload.SiteKey, payload.SecretKey)
		settingsUpdate["captcha.cloudflare.last_verified_signature"] = signature
		settingsUpdate["captcha.cloudflare.last_verified_at"] = now
	} else if provider == captcha.ProviderGeetest {
		signature := captcha.GenerateGeetestSignature(payload.CaptchaID, payload.CaptchaKey)
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
