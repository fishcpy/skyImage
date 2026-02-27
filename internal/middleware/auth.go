package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"skyimage/internal/data"
	"skyimage/internal/users"
)

const userContextKey = "currentUser"

func Auth(userService *users.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		user, err := userService.ParseToken(c.Request.Context(), token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
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
