package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"skyimage/internal/installer"
)

func (s *Server) registerInstallerRoutes(r *gin.RouterGroup) {
	group := r.Group("/installer")
	group.GET("/status", s.getInstallerStatus)
	group.POST("/run", s.postInstallerRun)
}

func (s *Server) getInstallerStatus(c *gin.Context) {
	status, err := s.installer.Status(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": status})
}

func (s *Server) postInstallerRun(c *gin.Context) {
	var input installer.RunInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	status, err := s.installer.Run(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": status})
}
