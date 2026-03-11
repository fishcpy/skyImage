package api

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"skyimage/internal/data"
	"skyimage/internal/middleware"
	"skyimage/internal/users"
)

const apiTokenExpiryLayout = "2006-01-02 15:04"

func (s *Server) registerAccountRoutes(r *gin.RouterGroup) {
	account := r.Group("/account")
	account.Use(s.authMiddleware())

	// 只读接口不需要 CSRF
	account.GET("/profile", s.handleAccountProfile)
	account.GET("/api-tokens", s.handleListApiTokens)

	// 写操作需要 CSRF
	accountWithCSRF := account.Group("")
	accountWithCSRF.Use(middleware.RequireCSRF())
	accountWithCSRF.PUT("/profile", s.handleAccountUpdateProfile)
	accountWithCSRF.DELETE("/profile", s.handleAccountDelete)
	accountWithCSRF.POST("/api-token", s.handleGenerateApiToken)
	accountWithCSRF.PATCH("/api-token/:id", s.handleUpdateApiToken)
	accountWithCSRF.DELETE("/api-token/:id", s.handleDeleteApiToken)
	accountWithCSRF.DELETE("/api-token", s.handleDeleteApiTokens)
}

func (s *Server) handleAccountProfile(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": user})
}

func (s *Server) handleAccountUpdateProfile(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var input users.ProfileUpdateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := s.users.UpdateProfile(c.Request.Context(), user.ID, input)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": updated})
}

func (s *Server) handleAccountDelete(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := s.users.DeleteOwnAccount(c.Request.Context(), user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if sessionID, err := c.Cookie("skyimage_session"); err == nil && sessionID != "" {
		s.session.Delete(sessionID)
	}
	c.JSON(http.StatusOK, gin.H{"message": "account deleted"})
}

func (s *Server) handleGenerateApiToken(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		ExpiresAt string `json:"expiresAt"`
	}
	if err := c.ShouldBindJSON(&req); err != nil && err != io.EOF {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	expiry, err := parseApiTokenExpiry(req.ExpiresAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tokenStr, err := data.GenerateAPIToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	s.mu.RLock()
	db := s.db
	s.mu.RUnlock()

	apiToken := data.ApiToken{
		UserID:    user.ID,
		Token:     data.HashAPIToken(tokenStr),
		ExpiresAt: data.NormalizeApiTokenExpiry(expiry),
	}
	if err := db.Create(&apiToken).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"token": tokenStr}})
}

func (s *Server) handleListApiTokens(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	s.mu.RLock()
	db := s.db
	s.mu.RUnlock()

	var tokens []data.ApiToken
	if err := db.Where("user_id = ?", user.ID).Order("created_at DESC").Find(&tokens).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch tokens"})
		return
	}

	type tokenResp struct {
		ID         uint       `json:"id"`
		Token      string     `json:"tokenMasked"`
		CreatedAt  time.Time  `json:"createdAt"`
		ExpiresAt  time.Time  `json:"expiresAt"`
		LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
	}
	items := make([]tokenResp, 0, len(tokens))
	for _, token := range tokens {
		items = append(items, tokenResp{
			ID:         token.ID,
			Token:      maskStoredToken(token.Token),
			CreatedAt:  token.CreatedAt,
			ExpiresAt:  token.ExpiresAt,
			LastUsedAt: token.LastUsedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

func maskStoredToken(token string) string {
	trimmed := strings.TrimSpace(token)
	if trimmed == "" {
		return "****"
	}
	if strings.Contains(trimmed, "|") {
		prefix := strings.SplitN(trimmed, "|", 2)[0]
		return prefix + "|********"
	}
	if len(trimmed) <= 12 {
		return "****"
	}
	return trimmed[:6] + "..." + trimmed[len(trimmed)-4:]
}

func (s *Server) handleDeleteApiToken(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing token ID"})
		return
	}

	s.mu.RLock()
	db := s.db
	s.mu.RUnlock()

	result := db.Where("id = ? AND user_id = ?", id, user.ID).Delete(&data.ApiToken{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete token"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "token deleted"})
}

func (s *Server) handleUpdateApiToken(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing token ID"})
		return
	}

	var req struct {
		ExpiresAt string `json:"expiresAt"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	expiry, err := parseApiTokenExpiry(req.ExpiresAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.mu.RLock()
	db := s.db
	s.mu.RUnlock()

	result := db.Model(&data.ApiToken{}).
		Where("id = ? AND user_id = ?", id, user.ID).
		Update("expires_at", data.NormalizeApiTokenExpiry(expiry))
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update token"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Token not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "token updated"})
}

func (s *Server) handleDeleteApiTokens(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	s.mu.RLock()
	db := s.db
	s.mu.RUnlock()

	if err := db.Where("user_id = ?", user.ID).Delete(&data.ApiToken{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete tokens"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "tokens deleted"})
}

func parseApiTokenExpiry(value string) (time.Time, error) {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" || trimmed == "never" || trimmed == "permanent" || trimmed == "infinite" || trimmed == "永久" || trimmed == "无限" || trimmed == "0" {
		return data.NewNeverExpireTime(), nil
	}
	if ts, err := time.Parse(time.RFC3339, value); err == nil {
		return ts, nil
	}
	if ts, err := time.ParseInLocation(apiTokenExpiryLayout, value, time.Local); err == nil {
		return ts, nil
	}
	if ts, err := time.ParseInLocation("2006-01-02 15:04:05", value, time.Local); err == nil {
		return ts, nil
	}
	return time.Time{}, fmt.Errorf("Invalid expiresAt format")
}
