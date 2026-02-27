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
	enableAPI := settings["features.api"] != "false"
	disabledNotice := settings["account.disabled_notice"]
	if strings.TrimSpace(disabledNotice) == "" {
		disabledNotice = defaultAccountDisabledNotice
	}

	response := gin.H{
		"title":                 settings["site.title"],
		"description":           settings["site.description"],
		"about":                 status.About,
		"enableGallery":         enableGallery,
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
