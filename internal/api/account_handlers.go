package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"skyimage/internal/middleware"
	"skyimage/internal/users"
)

func (s *Server) registerAccountRoutes(r *gin.RouterGroup) {
	account := r.Group("/account")
	account.Use(s.authMiddleware())
	account.GET("/profile", s.handleAccountProfile)
	account.PUT("/profile", s.handleAccountUpdateProfile)
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
