package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"skyimage/internal/files"
)

func (s *Server) registerSiteRoutes(r *gin.RouterGroup) {
	r.GET("/site/config", s.handleSiteConfig)
	r.GET("/site/turnstile/:scenario", s.handleTurnstileConfig)
	r.GET("/gallery/public", s.handleGalleryPublic)
	s.engine.GET("/favicon.ico", s.handleFavicon)
}

func (s *Server) handleSiteConfig(c *gin.Context) {
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	status, err := s.installer.Status(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	enableGallery := settings["features.gallery"] != "false"
	enableHome := settings["features.home"] != "false"
	enableAPI := settings["features.api"] != "false"
	disabledNotice := settings["account.disabled_notice"]
	if strings.TrimSpace(disabledNotice) == "" {
		disabledNotice = defaultAccountDisabledNotice
	}

	aboutText := settings["site.about"]
	if strings.TrimSpace(aboutText) == "" {
		aboutText = status.About
	}

	response := gin.H{
		"title":                          settings["site.title"],
		"description":                    settings["site.description"],
		"slogan":                         settings["site.slogan"],
		"logo":                           settings["site.logo"],
		"homeBadgeText":                  settings["home.badge_text"],
		"homeIntroText":                  settings["home.intro_text"],
		"homePrimaryCtaText":             settings["home.primary_cta_text"],
		"homeDashboardCtaText":           settings["home.dashboard_cta_text"],
		"homeSecondaryCtaText":           settings["home.secondary_cta_text"],
		"homeFeature1Title":              settings["home.feature1_title"],
		"homeFeature1Desc":               settings["home.feature1_desc"],
		"homeFeature2Title":              settings["home.feature2_title"],
		"homeFeature2Desc":               settings["home.feature2_desc"],
		"homeFeature3Title":              settings["home.feature3_title"],
		"homeFeature3Desc":               settings["home.feature3_desc"],
		"about":                          aboutText,
		"aboutTitle":                     settings["site.about_title"],
		"notFoundMode":                   settings["site.notfound_mode"],
		"notFoundHeading":                settings["site.notfound_heading"],
		"notFoundText":                   settings["site.notfound_text"],
		"notFoundHtml":                   settings["site.notfound_html"],
		"termsOfService":                 settings["site.terms_of_service"],
		"privacyPolicy":                  settings["site.privacy_policy"],
		"enableGallery":                  enableGallery,
		"enableHome":                     enableHome,
		"enableApi":                      enableAPI,
		"imageLoadRows":                  normalizeImageLoadRows(settings["images.load_rows"]),
		"forgotPasswordEnabled":          settings["mail.forgot_password.enabled"] == "true",
		"forgotPasswordTurnstileRequest": settings["mail.forgot_password.turnstile_request"] == "true",
		"forgotPasswordTurnstileReset":   settings["mail.forgot_password.turnstile_reset"] == "true",
		"version":                        status.Version,
		"accountDisabledNotice":          disabledNotice,
	}
	c.JSON(http.StatusOK, gin.H{"data": response})
}

func (s *Server) handleGalleryPublic(c *gin.Context) {
	limit, offset := parsePagination(c, 40, 100)
	items, err := s.files.ListPublic(c.Request.Context(), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dtos := make([]files.FileDTO, 0, len(items))
	for _, file := range items {
		dto, err := s.files.ToDTO(c.Request.Context(), file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		dtos = append(dtos, dto)
	}
	c.JSON(http.StatusOK, gin.H{"data": dtos})
}

func (s *Server) handleTurnstileConfig(c *gin.Context) {
	scenario := c.Param("scenario")
	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var configKey string
	switch scenario {
	case "login":
		configKey = "turnstile.login"
	case "register":
		configKey = "turnstile.register"
	case "register_verify":
		configKey = "turnstile.register_verify"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid scenario"})
		return
	}

	enabled := settings[configKey] == "true"

	response := gin.H{
		"enabled": enabled,
	}

	if enabled {
		siteKey := settings["turnstile.site_key"]
		if siteKey != "" {
			response["siteKey"] = siteKey
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}

func (s *Server) handleFavicon(c *gin.Context) {
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")

	settings, err := s.admin.GetSettings(c.Request.Context())
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	logoURL := strings.TrimSpace(settings["site.logo"])
	if logoURL == "" {
		c.Status(http.StatusNotFound)
		return
	}

	// 如果是外部链接，重定向到该链接
	if strings.HasPrefix(logoURL, "http://") || strings.HasPrefix(logoURL, "https://") {
		c.Redirect(http.StatusFound, logoURL)
		return
	}

	// 如果是相对路径，重定向到实际的文件URL
	// 这样可以利用现有的文件服务逻辑
	if !strings.HasPrefix(logoURL, "/") {
		logoURL = "/" + logoURL
	}
	c.Redirect(http.StatusFound, logoURL)
}
