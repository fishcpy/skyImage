package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"skyimage/internal/captcha"
	"skyimage/internal/notifications"
)

// ---------------------------------------------------------------------------
// Site Settings (GET/PUT /admin/system/site)
// ---------------------------------------------------------------------------

type siteSettingsPayload struct {
	SiteTitle            string `json:"siteTitle"`
	ConsoleURL           string `json:"consoleUrl"`
	SiteDescription      string `json:"siteDescription"`
	SiteSlogan           string `json:"siteSlogan"`
	SiteLogo             string `json:"siteLogo"`
	About                string `json:"about"`
	AboutTitle           string `json:"aboutTitle"`
	NotFoundMode         string `json:"notFoundMode"`
	NotFoundHeading      string `json:"notFoundHeading"`
	NotFoundText         string `json:"notFoundText"`
	NotFoundHtml         string `json:"notFoundHtml"`
	TermsOfService       string `json:"termsOfService"`
	PrivacyPolicy        string `json:"privacyPolicy"`
	HomePageMode         string `json:"homePageMode"`
	HomeCustomHTML       string `json:"homeCustomHtml"`
	EnableGallery        bool   `json:"enableGallery"`
	EnableHome           bool   `json:"enableHome"`
	EnableApi            bool   `json:"enableApi"`
	AllowRegistration    bool   `json:"allowRegistration"`
	AccountDisabledNotice string `json:"accountDisabledNotice"`
}

func (s *Server) handleAdminSiteSettings(c *gin.Context) {
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
	homePageMode := strings.TrimSpace(settings["site.home_page_mode"])
	if homePageMode != "custom_html" {
		homePageMode = "default"
	}
	homeCustomHTML := ""
	if homePageMode == "custom_html" {
		homeCustomHTML = settings["site.home_custom_html"]
	}
	disabledNotice := settings["account.disabled_notice"]
	if strings.TrimSpace(disabledNotice) == "" {
		disabledNotice = defaultAccountDisabledNotice
	}

	payload := siteSettingsPayload{
		SiteTitle:            settings["site.title"],
		ConsoleURL:           consoleURL,
		SiteDescription:      settings["site.description"],
		SiteSlogan:           settings["site.slogan"],
		SiteLogo:             settings["site.logo"],
		About:                settings["site.about"],
		AboutTitle:           settings["site.about_title"],
		NotFoundMode:         settings["site.notfound_mode"],
		NotFoundHeading:      settings["site.notfound_heading"],
		NotFoundText:         settings["site.notfound_text"],
		NotFoundHtml:         settings["site.notfound_html"],
		TermsOfService:       settings["site.terms_of_service"],
		PrivacyPolicy:        settings["site.privacy_policy"],
		HomePageMode:         homePageMode,
		HomeCustomHTML:       homeCustomHTML,
		EnableGallery:        settings["features.gallery"] != "false",
		EnableHome:           settings["features.home"] != "false",
		EnableApi:            settings["features.api"] != "false",
		AllowRegistration:    settings["features.allow_registration"] != "false",
		AccountDisabledNotice: disabledNotice,
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

func (s *Server) handleAdminUpdateSiteSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	var payload siteSettingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
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

	values := map[string]string{
		"site.title":                  payload.SiteTitle,
		"site.console_url":            payload.ConsoleURL,
		"site.description":            payload.SiteDescription,
		"site.slogan":                 payload.SiteSlogan,
		"site.logo":                   payload.SiteLogo,
		"site.about":                  payload.About,
		"site.about_title":            payload.AboutTitle,
		"site.notfound_mode":          payload.NotFoundMode,
		"site.notfound_heading":       payload.NotFoundHeading,
		"site.notfound_text":          payload.NotFoundText,
		"site.notfound_html":          payload.NotFoundHtml,
		"site.terms_of_service":       payload.TermsOfService,
		"site.privacy_policy":         payload.PrivacyPolicy,
		"site.home_page_mode":         homePageMode,
		"site.home_custom_html":       homeCustomHTML,
		"features.gallery":            strconv.FormatBool(payload.EnableGallery),
		"features.home":               strconv.FormatBool(payload.EnableHome),
		"features.api":                strconv.FormatBool(payload.EnableApi),
		"features.allow_registration": strconv.FormatBool(payload.AllowRegistration),
		"account.disabled_notice":     notice,
	}

	oldSettings, _ := s.admin.GetSettings(c.Request.Context())
	oldConsole := strings.TrimSpace(oldSettings["site.console_url"])
	newConsole := strings.TrimSpace(payload.ConsoleURL)

	if err := s.admin.UpdateSettings(c.Request.Context(), values); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// When console URL changes, rewrite stored thumbnail public URLs to the new domain.
	if newConsole != "" && !strings.EqualFold(strings.TrimRight(oldConsole, "/"), strings.TrimRight(newConsole, "/")) {
		if _, err := s.files.RewriteThumbnailPublicURLsToConsole(c.Request.Context()); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "站点已保存，但缩略图链接更新失败: " + err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}

// ---------------------------------------------------------------------------
// General Settings (GET/PUT /admin/system/general)
// ---------------------------------------------------------------------------

type generalSettingsPayload struct {
	ImageLoadRows                int    `json:"imageLoadRows"`
	UserNotificationLimit        int    `json:"userNotificationLimit"`
	AdminImageDeleteDefaultReason string `json:"adminImageDeleteDefaultReason"`
	SystemAutoDeleteDefaultReason string `json:"systemAutoDeleteDefaultReason"`
	EnableCDN                    bool   `json:"enableCDN"`
}

func (s *Server) handleAdminGeneralSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	payload := generalSettingsPayload{
		ImageLoadRows:                normalizeImageLoadRows(settings["images.load_rows"]),
		UserNotificationLimit:        notifications.NormalizeRetentionLimit(settings[notifications.ConfigUserRetentionLimit]),
		AdminImageDeleteDefaultReason: notifications.NormalizeAdminDeleteReason(settings[notifications.ConfigAdminImageDeleteReason]),
		SystemAutoDeleteDefaultReason: notifications.NormalizeSystemAutoDeleteReason(settings[notifications.ConfigSystemAutoDeleteReason]),
		EnableCDN:                    settings["mail.cdn.enabled"] == "true",
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

func (s *Server) handleAdminUpdateGeneralSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	var payload generalSettingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	adminDeleteReason := notifications.NormalizeAdminDeleteReason(payload.AdminImageDeleteDefaultReason)
	systemAutoDeleteReason := notifications.NormalizeSystemAutoDeleteReason(payload.SystemAutoDeleteDefaultReason)

	values := map[string]string{
		"images.load_rows":                         strconv.Itoa(normalizeImageLoadRowsValue(payload.ImageLoadRows)),
		notifications.ConfigUserRetentionLimit:      strconv.Itoa(normalizeUserNotificationLimit(payload.UserNotificationLimit)),
		notifications.ConfigAdminImageDeleteReason:  adminDeleteReason,
		notifications.ConfigSystemAutoDeleteReason:  systemAutoDeleteReason,
		"mail.cdn.enabled":                         strconv.FormatBool(payload.EnableCDN),
	}

	if err := s.admin.UpdateSettings(c.Request.Context(), values); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}

// ---------------------------------------------------------------------------
// Email Settings (GET/PUT /admin/system/email)
// ---------------------------------------------------------------------------

type emailSettingsPayload struct {
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
}

func (s *Server) handleAdminEmailSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	payload := emailSettingsPayload{
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
	}
	c.JSON(http.StatusOK, gin.H{"data": payload})
}

func (s *Server) handleAdminUpdateEmailSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	var payload emailSettingsPayload
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

	values := map[string]string{
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
	}

	if err := s.admin.UpdateSettings(c.Request.Context(), values); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}

// ---------------------------------------------------------------------------
// Captcha Settings (GET/PUT /admin/system/captcha)
// ---------------------------------------------------------------------------

type captchaSettingsPayload struct {
	EnableCaptcha                      bool   `json:"enableCaptcha"`
	CaptchaProvider                    string `json:"captchaProvider"`
	CloudflareSiteKey                  string `json:"cloudflareSiteKey"`
	CloudflareSecretKey                string `json:"cloudflareSecretKey"`
	GeetestCaptchaID                   string `json:"geetestCaptchaId"`
	GeetestCaptchaKey                  string `json:"geetestCaptchaKey"`
	CapInstanceURL                     string `json:"capInstanceUrl"`
	CapSiteKey                         string `json:"capSiteKey"`
	CapSecretKey                       string `json:"capSecretKey"`
	EnableLoginCaptcha                 bool   `json:"enableLoginCaptcha"`
	EnableRegisterCaptcha              bool   `json:"enableRegisterCaptcha"`
	EnableRegisterVerifyCaptcha        bool   `json:"enableRegisterVerifyCaptcha"`
	EnableForgotPasswordRequestCaptcha bool   `json:"enableForgotPasswordRequestCaptcha"`
	EnableForgotPasswordResetCaptcha   bool   `json:"enableForgotPasswordResetCaptcha"`
	EnableRedeemCaptcha                bool   `json:"enableRedeemCaptcha"`
}

type captchaSettingsResponse struct {
	captchaSettingsPayload
	CloudflareVerified       bool   `json:"cloudflareVerified"`
	CloudflareLastVerifiedAt string `json:"cloudflareLastVerifiedAt,omitempty"`
	GeetestVerified          bool   `json:"geetestVerified"`
	GeetestLastVerifiedAt    string `json:"geetestLastVerifiedAt,omitempty"`
	CapVerified              bool   `json:"capVerified"`
	CapLastVerifiedAt        string `json:"capLastVerifiedAt,omitempty"`
}

func (s *Server) handleAdminCaptchaSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := captchaSettingsResponse{
		captchaSettingsPayload: captchaSettingsPayload{
			EnableCaptcha:                      settings["captcha.enabled"] == "true",
			CaptchaProvider:                    settings["captcha.provider"],
			CloudflareSiteKey:                  settings["captcha.cloudflare.site_key"],
			CloudflareSecretKey:                redactSecret(settings["captcha.cloudflare.secret_key"]),
			GeetestCaptchaID:                   settings["captcha.geetest.captcha_id"],
			GeetestCaptchaKey:                  redactSecret(settings["captcha.geetest.captcha_key"]),
			CapInstanceURL:                     settings["captcha.cap.instance_url"],
			CapSiteKey:                         settings["captcha.cap.site_key"],
			CapSecretKey:                       redactSecret(settings["captcha.cap.secret_key"]),
			EnableLoginCaptcha:                 settings["captcha.login"] == "true",
			EnableRegisterCaptcha:              settings["captcha.register"] == "true",
			EnableRegisterVerifyCaptcha:        settings["captcha.register_verify"] == "true",
			EnableForgotPasswordRequestCaptcha: settings["captcha.forgot_password_request"] == "true",
			EnableForgotPasswordResetCaptcha:   settings["captcha.forgot_password_reset"] == "true",
			EnableRedeemCaptcha:                settings["captcha.redeem"] == "true",
		},
		CloudflareLastVerifiedAt: settings["captcha.cloudflare.last_verified_at"],
		GeetestLastVerifiedAt:    settings["captcha.geetest.last_verified_at"],
		CapLastVerifiedAt:        settings["captcha.cap.last_verified_at"],
	}

	// 检查 Cloudflare 验证状态
	cloudflareExpectedSig := captcha.GenerateSignature(resp.CloudflareSiteKey, settings["captcha.cloudflare.secret_key"])
	cloudflareStoredSig := settings["captcha.cloudflare.last_verified_signature"]
	if cloudflareExpectedSig != "" && cloudflareStoredSig == cloudflareExpectedSig {
		resp.CloudflareVerified = true
	}
	// 检查 Geetest 验证状态
	geetestExpectedSig := captcha.GenerateGeetestSignature(resp.GeetestCaptchaID, settings["captcha.geetest.captcha_key"])
	geetestStoredSig := settings["captcha.geetest.last_verified_signature"]
	if geetestExpectedSig != "" && geetestStoredSig == geetestExpectedSig {
		resp.GeetestVerified = true
	}
	// 检查 Cap 验证状态
	capExpectedSig := captcha.GenerateCapSignature(resp.CapInstanceURL, resp.CapSiteKey, settings["captcha.cap.secret_key"])
	capStoredSig := settings["captcha.cap.last_verified_signature"]
	if capExpectedSig != "" && capStoredSig == capExpectedSig {
		resp.CapVerified = true
	}

	c.JSON(http.StatusOK, gin.H{"data": resp})
}

func (s *Server) handleAdminUpdateCaptchaSettings(c *gin.Context) {
	if !requireSuperAdmin(c) {
		return
	}
	var payload captchaSettingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 处理密钥 "***" 保留逻辑
	cloudflareSecretKey := strings.TrimSpace(payload.CloudflareSecretKey)
	if cloudflareSecretKey == "" || cloudflareSecretKey == "***" {
		cloudflareSecretKey = settings["captcha.cloudflare.secret_key"]
	}
	geetestCaptchaKey := strings.TrimSpace(payload.GeetestCaptchaKey)
	if geetestCaptchaKey == "" || geetestCaptchaKey == "***" {
		geetestCaptchaKey = settings["captcha.geetest.captcha_key"]
	}
	capSecretKey := strings.TrimSpace(payload.CapSecretKey)
	if capSecretKey == "" || capSecretKey == "***" {
		capSecretKey = settings["captcha.cap.secret_key"]
	}
	capInstanceURL := strings.TrimSpace(payload.CapInstanceURL)
	if capInstanceURL != "" {
		if normalized, err := captcha.NormalizeCapInstanceURL(capInstanceURL); err == nil {
			capInstanceURL = normalized
		}
	}
	capSiteKey := strings.TrimSpace(payload.CapSiteKey)

	// 检测配置变更
	currentCloudflareSiteKey := settings["captcha.cloudflare.site_key"]
	currentCloudflareSecretKey := settings["captcha.cloudflare.secret_key"]
	currentGeetestCaptchaID := settings["captcha.geetest.captcha_id"]
	currentGeetestCaptchaKey := settings["captcha.geetest.captcha_key"]
	currentCapInstanceURL := settings["captcha.cap.instance_url"]
	currentCapSiteKey := settings["captcha.cap.site_key"]
	currentCapSecretKey := settings["captcha.cap.secret_key"]

	cloudflareConfigChanged := payload.CloudflareSiteKey != currentCloudflareSiteKey || cloudflareSecretKey != currentCloudflareSecretKey
	geetestConfigChanged := payload.GeetestCaptchaID != currentGeetestCaptchaID || geetestCaptchaKey != currentGeetestCaptchaKey
	capConfigChanged := capInstanceURL != currentCapInstanceURL || capSiteKey != currentCapSiteKey || capSecretKey != currentCapSecretKey

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
		} else if payload.CaptchaProvider == "cap" {
			if capInstanceURL == "" || capSiteKey == "" || capSecretKey == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "使用 Cap 验证时必须填写 Instance URL、Site Key 和 Secret Key"})
				return
			}
			if _, err := captcha.NormalizeCapInstanceURL(capInstanceURL); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			newCapSig := captcha.GenerateCapSignature(capInstanceURL, capSiteKey, capSecretKey)
			if newCapSig == "" || settings["captcha.cap.last_verified_signature"] != newCapSig {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Cap 配置已变更或未验证，请先点击测试并验证成功后再保存"})
				return
			}
		}
	}

	values := map[string]string{
		"captcha.enabled":                 strconv.FormatBool(payload.EnableCaptcha),
		"captcha.provider":                payload.CaptchaProvider,
		"captcha.cloudflare.site_key":     payload.CloudflareSiteKey,
		"captcha.cloudflare.secret_key":   cloudflareSecretKey,
		"captcha.geetest.captcha_id":      payload.GeetestCaptchaID,
		"captcha.geetest.captcha_key":     geetestCaptchaKey,
		"captcha.cap.instance_url":        capInstanceURL,
		"captcha.cap.site_key":            capSiteKey,
		"captcha.cap.secret_key":          capSecretKey,
		"captcha.login":                   strconv.FormatBool(payload.EnableLoginCaptcha),
		"captcha.register":                strconv.FormatBool(payload.EnableRegisterCaptcha),
		"captcha.register_verify":         strconv.FormatBool(payload.EnableRegisterVerifyCaptcha),
		"captcha.forgot_password_request": strconv.FormatBool(payload.EnableForgotPasswordRequestCaptcha),
		"captcha.forgot_password_reset":   strconv.FormatBool(payload.EnableForgotPasswordResetCaptcha),
		"captcha.redeem":                  strconv.FormatBool(payload.EnableRedeemCaptcha),
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
	// Cap 配置变更时清除验证状态
	if capConfigChanged {
		values["captcha.cap.last_verified_signature"] = ""
		values["captcha.cap.last_verified_at"] = ""
	}

	if err := s.admin.UpdateSettings(c.Request.Context(), values); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "updated"})
}
