package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"skyimage/internal/files"
)

func (s *Server) registerSiteRoutes(r *gin.RouterGroup) {
	r.GET("/site/config", s.handleSiteConfig)
	r.GET("/site/turnstile", s.handleTurnstileConfig)
	r.GET("/gallery/public", s.handleGalleryPublic)
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
		"title":                 settings["site.title"],
		"description":           settings["site.description"],
		"slogan":                settings["site.slogan"],
		"homeBadgeText":         settings["home.badge_text"],
		"homeIntroText":         settings["home.intro_text"],
		"homePrimaryCtaText":    settings["home.primary_cta_text"],
		"homeDashboardCtaText":  settings["home.dashboard_cta_text"],
		"homeSecondaryCtaText":  settings["home.secondary_cta_text"],
		"homeFeature1Title":     settings["home.feature1_title"],
		"homeFeature1Desc":      settings["home.feature1_desc"],
		"homeFeature2Title":     settings["home.feature2_title"],
		"homeFeature2Desc":      settings["home.feature2_desc"],
		"homeFeature3Title":     settings["home.feature3_title"],
		"homeFeature3Desc":      settings["home.feature3_desc"],
		"about":                 aboutText,
		"notFoundMode":          settings["site.notfound_mode"],
		"notFoundHeading":       settings["site.notfound_heading"],
		"notFoundText":          settings["site.notfound_text"],
		"notFoundHtml":          settings["site.notfound_html"],
		"enableGallery":         enableGallery,
		"enableHome":            enableHome,
		"enableApi":             enableAPI,
		"version":               status.Version,
		"accountDisabledNotice": disabledNotice,
	}
	c.JSON(http.StatusOK, gin.H{"data": response})
}

func (s *Server) handleGalleryPublic(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "40"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
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
	enabled, err := s.turnstile.IsEnabled(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := gin.H{
		"enabled": enabled,
	}

	if enabled {
		siteKey, err := s.turnstile.GetSiteKey(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		response["siteKey"] = siteKey
	}

	c.JSON(http.StatusOK, gin.H{"data": response})
}
