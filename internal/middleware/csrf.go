package middleware

import (
	"crypto/subtle"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	CSRFCookieName = "skyimage_csrf"
	CSRFHeaderName = "X-CSRF-Token"
)

func RequireCSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isSafeMethod(c.Request.Method) {
			c.Next()
			return
		}

		token := strings.TrimSpace(c.GetHeader(CSRFHeaderName))
		if token == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "missing csrf token"})
			return
		}

		cookieToken, err := c.Cookie(CSRFCookieName)
		if err != nil || strings.TrimSpace(cookieToken) == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "missing csrf cookie"})
			return
		}
		if subtle.ConstantTimeCompare([]byte(cookieToken), []byte(token)) != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid csrf token"})
			return
		}

		origin := strings.TrimSpace(c.GetHeader("Origin"))
		if origin != "" {
			// 在开发环境中，允许 localhost 的不同端口之间的请求
			if !sameOrigin(origin, c.Request.Host) && !isLocalhostCrossPort(origin, c.Request.Host) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid origin"})
				return
			}
		}

		c.Next()
	}
}

func isSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}

func sameOrigin(origin, requestHost string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(parsed.Host), strings.TrimSpace(requestHost))
}

func isLocalhostCrossPort(origin, requestHost string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" {
		return false
	}

	originHost := strings.ToLower(strings.Split(parsed.Host, ":")[0])
	requestHostName := strings.ToLower(strings.Split(requestHost, ":")[0])

	// 检查是否都是 localhost 或 127.0.0.1
	isOriginLocal := originHost == "localhost" || originHost == "127.0.0.1"
	isRequestLocal := requestHostName == "localhost" || requestHostName == "127.0.0.1"

	return isOriginLocal && isRequestLocal
}
