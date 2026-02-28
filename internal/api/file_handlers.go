package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"skyimage/internal/files"
	"skyimage/internal/middleware"
	"skyimage/internal/users"
)

func (s *Server) registerFileRoutes(r *gin.RouterGroup) {
	fileGroup := r.Group("/files")
	fileGroup.Use(s.authMiddleware())
	fileGroup.GET("", s.handleListFiles)
	fileGroup.GET("/strategies", s.handleListAvailableStrategies)
	fileGroup.POST("", s.handleUploadFile)
	fileGroup.GET("/:id", s.handleGetFile)
	fileGroup.DELETE("/:id", s.handleDeleteFile)
	fileGroup.PATCH("/:id/visibility", s.handleUpdateFileVisibility)
	fileGroup.PATCH("/batch/visibility", s.handleBatchUpdateFileVisibility)
	fileGroup.POST("/batch/delete", s.handleBatchDeleteFiles)
}

func (s *Server) handleListFiles(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	items, err := s.files.List(c.Request.Context(), user.ID, limit, offset)
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

func (s *Server) handleUploadFile(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	visibility := c.PostForm("visibility")
	if visibility == "" {
		visibility = users.DefaultVisibility(user)
	}
	strategyIDStr := c.PostForm("strategyId")
	var strategyID uint
	if strategyIDStr != "" {
		if parsed, err := strconv.Atoi(strategyIDStr); err == nil && parsed > 0 {
			strategyID = uint(parsed)
		}
	}
	record, err := s.files.Upload(c.Request.Context(), user, file, files.UploadOptions{
		Visibility: visibility,
		StrategyID: strategyID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	created, err := s.files.FindByID(c.Request.Context(), record.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dto, err := s.files.ToDTO(c.Request.Context(), created)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": dto})
}

func (s *Server) handleGetFile(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	file, err := s.files.FindByID(c.Request.Context(), uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if file.UserID != user.ID && !user.IsAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	dto, err := s.files.ToDTO(c.Request.Context(), file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": dto})
}

func (s *Server) handleDeleteFile(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := s.files.Delete(c.Request.Context(), user.ID, uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": "deleted"})
}

func (s *Server) handleUpdateFileVisibility(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
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
	file, err := s.files.UpdateVisibility(c.Request.Context(), user.ID, uint(id), payload.Visibility)
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

func (s *Server) handleBatchUpdateFileVisibility(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var payload struct {
		IDs        []uint `json:"ids"`
		Visibility string `json:"visibility"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := s.files.UpdateVisibilityBatch(c.Request.Context(), user.ID, payload.IDs, payload.Visibility)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"updated": updated}})
}

func (s *Server) handleBatchDeleteFiles(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	var payload struct {
		IDs []uint `json:"ids"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	deleted, err := s.files.DeleteBatch(c.Request.Context(), user.ID, payload.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"deleted": deleted}})
}

func (s *Server) handleListAvailableStrategies(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	strategies, err := s.files.ListStrategiesForUser(c.Request.Context(), user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	type option struct {
		ID    uint   `json:"id"`
		Name  string `json:"name"`
		Intro string `json:"intro"`
	}
	opts := make([]option, 0, len(strategies))
	for _, item := range strategies {
		opts = append(opts, option{ID: item.ID, Name: item.Name, Intro: item.Intro})
	}
	resp := gin.H{
		"strategies": opts,
	}
	if preferred := users.DefaultStrategyID(user); preferred != nil {
		resp["defaultStrategyId"] = *preferred
	}
	c.JSON(http.StatusOK, gin.H{"data": resp})
}
