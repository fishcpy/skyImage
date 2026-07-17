package api

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"skyimage/internal/middleware"
	"skyimage/internal/oauth"
	"skyimage/internal/users"
)

func (s *Server) registerOAuthRoutes(r *gin.RouterGroup) {
	auth := r.Group("/auth")
	auth.GET("/oauth/providers", s.handleOAuthProviders)
	auth.GET("/oauth/:provider/start", s.handleOAuthStart)
	// OptionalAuth so bind callback can re-check the logged-in session.
	auth.GET("/oauth/:provider/callback", s.optionalAuthMiddleware(), s.handleOAuthCallback)

	protected := auth.Group("/")
	protected.Use(s.authMiddleware())
	protected.GET("/oauth/bindings", s.handleOAuthListBindings)
	protected.POST("/oauth/:provider/bind", middleware.RequireCSRF(), s.handleOAuthBindStart)
	protected.DELETE("/oauth/:provider", middleware.RequireCSRF(), s.handleOAuthUnbind)
}

func (s *Server) handleOAuthProviders(c *gin.Context) {
	if s.oauth == nil {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"providers": []oauth.ProviderPublic{}}})
		return
	}
	providers, err := s.oauth.ListPublicProviders(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list oauth providers"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"providers": providers}})
}

func (s *Server) handleOAuthStart(c *gin.Context) {
	s.startOAuthFlow(c, oauth.ModeLogin, 0)
}

func (s *Server) handleOAuthBindStart(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	s.startOAuthFlow(c, oauth.ModeBind, user.ID)
}

func (s *Server) startOAuthFlow(c *gin.Context, mode string, userID uint) {
	if s.oauth == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "oauth not configured"})
		return
	}
	provider := normalizeOAuthProvider(c.Param("provider"))
	if provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown oauth provider"})
		return
	}
	cfg, err := s.oauth.GetProviderConfig(c.Request.Context(), provider)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, oauth.ErrProviderDisabled) {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	state, codeVerifier, err := s.oauth.CreateState(c.Request.Context(), provider, mode, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create oauth state"})
		return
	}

	redirectURI := s.oauthCallbackURL(c, provider)
	authURL, err := s.oauth.BuildAuthURL(cfg, redirectURI, state, codeVerifier)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// JSON for XHR clients; browser navigation gets redirect
	if strings.Contains(c.GetHeader("Accept"), "application/json") || c.Query("format") == "json" {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"url": authURL}})
		return
	}
	c.Redirect(http.StatusFound, authURL)
}

func (s *Server) handleOAuthCallback(c *gin.Context) {
	if s.oauth == nil {
		s.redirectOAuthResult(c, "/login", "oauth_error", "oauth not configured")
		return
	}
	provider := normalizeOAuthProvider(c.Param("provider"))
	if provider == "" {
		s.redirectOAuthResult(c, "/login", "oauth_error", "unknown provider")
		return
	}
	if errParam := strings.TrimSpace(c.Query("error")); errParam != "" {
		// Do not reflect arbitrary IdP error text into open redirects/query chains.
		s.redirectOAuthResult(c, "/login", "oauth_error", "provider_denied")
		return
	}
	code := strings.TrimSpace(c.Query("code"))
	state := strings.TrimSpace(c.Query("state"))
	if code == "" || state == "" {
		s.redirectOAuthResult(c, "/login", "oauth_error", "missing code or state")
		return
	}

	pending, err := s.oauth.ConsumeState(c.Request.Context(), state)
	if err != nil {
		s.redirectOAuthResult(c, "/login", "oauth_error", "invalid state")
		return
	}
	if pending.Provider != provider {
		s.redirectOAuthResult(c, "/login", "oauth_error", "provider mismatch")
		return
	}

	cfg, err := s.oauth.GetProviderConfig(c.Request.Context(), provider)
	if err != nil {
		s.redirectOAuthResult(c, "/login", "oauth_error", err.Error())
		return
	}

	redirectURI := s.oauthCallbackURL(c, provider)
	identity, err := s.oauth.ExchangeAndFetchIdentity(c.Request.Context(), cfg, code, redirectURI, pending.CodeVerifier)
	if err != nil {
		log.Printf("[oauth] exchange/userinfo failed: %v", err)
		s.redirectOAuthResult(c, "/login", "oauth_error", "oauth exchange failed")
		return
	}

	if pending.Mode == oauth.ModeBind {
		if pending.UserID == 0 {
			s.redirectOAuthResult(c, "/dashboard/settings", "oauth_error", "unauthorized")
			return
		}
		// Re-validate the logged-in session matches the user who started bind.
		// Prevents stolen bind-state tokens from attaching attacker IdP accounts.
		current, ok := middleware.CurrentUser(c)
		if !ok || current.ID != pending.UserID {
			s.redirectOAuthResult(c, "/login", "oauth_error", "session required for bind")
			return
		}
		if err := s.oauth.BindToUser(c.Request.Context(), pending.UserID, identity); err != nil {
			msg := err.Error()
			if errors.Is(err, oauth.ErrBindingExists) {
				msg = "already_bound"
			}
			s.redirectOAuthResult(c, "/dashboard/settings", "oauth_error", msg)
			return
		}
		s.redirectOAuthResult(c, "/dashboard/settings", "oauth_bound", provider)
		return
	}

	clientIP := getClientIP(c, s.isCDNEnabled(c.Request.Context()))
	user, err := s.oauth.CompleteLogin(c.Request.Context(), identity, clientIP)
	if err != nil {
		switch {
		case errors.Is(err, oauth.ErrRegistrationClosed):
			s.redirectOAuthResult(c, "/login", "oauth_error", "registration closed")
		case errors.Is(err, oauth.ErrAccountDisabled):
			s.redirectOAuthResult(c, "/login", "oauth_error", "account disabled")
		default:
			log.Printf("[oauth] complete login failed: %v", err)
			s.redirectOAuthResult(c, "/login", "oauth_error", "login failed")
		}
		return
	}

	sessionID, err := s.session.Create(user.ID)
	if err != nil {
		s.redirectOAuthResult(c, "/login", "oauth_error", "session failed")
		return
	}
	s.writeSessionCookie(c, sessionID)
	s.writeCSRFCookie(c)

	go func() {
		userNotifyEnabled := users.LoginNotificationEnabled(user)
		if err := s.mail.SendLoginNotification(context.Background(), user.Email, user.Name, clientIP, userNotifyEnabled); err != nil {
			log.Printf("[邮件] OAuth 登录提醒失败: %v", err)
		}
	}()

	s.redirectOAuthResult(c, "/dashboard", "oauth_login", "1")
}

func (s *Server) handleOAuthListBindings(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if s.oauth == nil {
		c.JSON(http.StatusOK, gin.H{"data": []oauth.BindingDTO{}})
		return
	}
	bindings, err := s.oauth.ListBindings(c.Request.Context(), user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": bindings})
}

func (s *Server) handleOAuthUnbind(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if s.oauth == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "oauth not configured"})
		return
	}
	provider := normalizeOAuthProvider(c.Param("provider"))
	if provider == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown oauth provider"})
		return
	}
	if err := s.oauth.Unbind(c.Request.Context(), user.ID, provider); err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, oauth.ErrBindingNotFound) {
			status = http.StatusNotFound
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"message": "unbound"}})
}

func normalizeOAuthProvider(raw string) string {
	p := strings.ToLower(strings.TrimSpace(raw))
	switch p {
	case "github", "google", "discord", "custom":
		return p
	default:
		return ""
	}
}

func (s *Server) oauthPublicBase(c *gin.Context) string {
	settings, _ := s.admin.GetSettings(c.Request.Context())
	base := strings.TrimSpace(settings["site.console_url"])
	if base == "" {
		base = strings.TrimSpace(s.cfg.PublicBaseURL)
	}
	// Do not fall back to Host header (open redirect / host injection).
	base = strings.TrimRight(base, "/")
	if u, err := url.Parse(base); err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return base
}

func (s *Server) oauthCallbackURL(c *gin.Context, provider string) string {
	base := s.oauthPublicBase(c)
	if base == "" {
		// Last resort relative callback for local misconfiguration only.
		return "/api/auth/oauth/" + provider + "/callback"
	}
	return base + "/api/auth/oauth/" + provider + "/callback"
}

func (s *Server) redirectOAuthResult(c *gin.Context, path, key, value string) {
	base := s.oauthPublicBase(c)
	if base == "" {
		// Stay same-origin when console URL is missing.
		c.Redirect(http.StatusFound, path+"?"+url.Values{key: {value}}.Encode())
		return
	}
	u, err := url.Parse(base + path)
	if err != nil {
		c.Redirect(http.StatusFound, path+"?"+url.Values{key: {value}}.Encode())
		return
	}
	q := u.Query()
	q.Set(key, value)
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusFound, u.String())
}
