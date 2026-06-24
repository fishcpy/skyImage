package api

import (
	"github.com/gin-gonic/gin"
)

func (s *Server) registerLskyV1Routes(apiGroup *gin.RouterGroup) {
	s.mu.RLock()
	db := s.db
	adminSvc := s.admin
	userService := s.users
	fileService := s.files
	authLimiter := s.authLimiter
	captchaSvc := s.captcha
	s.mu.RUnlock()

	handler := NewLskyV1Handler(db, adminSvc, userService, fileService, authLimiter, captchaSvc)

	v1 := apiGroup.Group("/v1")
	{
		// 授权相关
		v1.POST("/tokens", handler.CreateToken)
		v1.DELETE("/tokens", s.authMiddleware(), handler.DeleteTokens)
		v1.GET("/profile", s.authMiddleware(), handler.GetProfile)

		// 策略相关
		v1.GET("/strategies", handler.GetStrategies)

		// 图片相关
		v1.POST("/upload", s.authMiddleware(), handler.UploadImage)
		v1.GET("/images", s.authMiddleware(), handler.GetImages)
		v1.DELETE("/images/:key", s.authMiddleware(), handler.DeleteImage)

		// 相册相关
		v1.GET("/albums", s.authMiddleware(), handler.GetAlbums)
		v1.DELETE("/albums/:id", s.authMiddleware(), handler.DeleteAlbum)
	}
}
