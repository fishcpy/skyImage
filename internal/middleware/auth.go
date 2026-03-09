package middleware

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"skyimage/internal/data"
	"skyimage/internal/session"
	"skyimage/internal/users"
)

const userContextKey = "currentUser"

func Auth(userService *users.Service, sessionManager *session.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 尝试 Bearer Token 认证
		authHeader := c.GetHeader("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			user, ok := authenticateByToken(c, userService, token)
			if ok {
				c.Set(userContextKey, user)
				c.Next()
				return
			}
			// Bearer Token 提供但无效,直接返回 401
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		// 回退到 Session Cookie 认证
		sessionID, err := c.Cookie(session.CookieName)
		if err != nil || sessionID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing session"})
			return
		}

		userID, ok := sessionManager.Resolve(sessionID)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
			return
		}

		user, err := userService.FindByID(c.Request.Context(), userID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				sessionManager.Delete(sessionID)
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		// Check if user account is disabled
		if user.Status == 0 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account disabled"})
			return
		}
		c.Set(userContextKey, user)
		c.Next()
	}
}

func authenticateByToken(c *gin.Context, userService *users.Service, token string) (data.User, bool) {
	token = strings.TrimSpace(token)
	if token == "" {
		return data.User{}, false
	}

	var apiToken data.ApiToken
	now := time.Now()
	hashed := data.HashAPIToken(token)
	db := userService.DB()

	// 仅允许哈希值匹配，避免“数据库中的哈希值可直接当 Bearer Token 使用”
	if err := db.
		Where("expires_at > ?", now).
		Where("token = ?", hashed).
		First(&apiToken).Error; err != nil {
		// 兼容极少量旧版明文 token（格式包含 "|"），命中后会立即迁移为哈希
		if err := db.
			Where("expires_at > ?", now).
			Where("token = ?", token).
			First(&apiToken).Error; err != nil || !data.IsLegacyPlainAPIToken(apiToken.Token) {
			return data.User{}, false
		}
	}

	updates := map[string]interface{}{"last_used_at": now}
	if data.IsLegacyPlainAPIToken(apiToken.Token) {
		updates["token"] = hashed
	}
	_ = db.
		Model(&data.ApiToken{}).
		Where("id = ?", apiToken.ID).
		Updates(updates).Error

	user, err := userService.FindByID(c.Request.Context(), apiToken.UserID)
	if err != nil {
		return data.User{}, false
	}

	// Check if user account is disabled
	if user.Status == 0 {
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "account disabled"})
		return data.User{}, false
	}

	return user, true
}

func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
			return
		}
		if !user.IsAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin required"})
			return
		}
		c.Next()
	}
}

func RequireSuperAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUser(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing user"})
			return
		}
		if !user.IsSuperAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "super admin required"})
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) (data.User, bool) {
	raw, ok := c.Get(userContextKey)
	if !ok {
		return data.User{}, false
	}
	user, ok := raw.(data.User)
	return user, ok
}
