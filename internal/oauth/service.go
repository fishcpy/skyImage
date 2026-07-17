package oauth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"skyimage/internal/data"
	"skyimage/internal/users"
)

var (
	ErrProviderDisabled   = errors.New("oauth provider disabled")
	ErrProviderUnknown    = errors.New("unknown oauth provider")
	ErrInvalidState       = errors.New("invalid oauth state")
	ErrRegistrationClosed = errors.New("registration closed")
	ErrOAuthOnlyRegister  = errors.New("password registration disabled")
	ErrBindingExists      = errors.New("oauth account already bound")
	ErrBindingNotFound    = errors.New("oauth binding not found")
	ErrAccountDisabled = errors.New("account disabled")
)

const (
	ModeLogin = "login"
	ModeBind  = "bind"

	RegModeOpen      = "open"
	RegModeOAuthOnly = "oauth_only"
	RegModeClosed    = "closed"
)

type SettingsReader interface {
	GetSettings(ctx context.Context) (map[string]string, error)
}

type Service struct {
	db       *gorm.DB
	settings SettingsReader
	http     *http.Client
}

// PendingState is returned after consuming a one-time OAuth state.
type PendingState struct {
	Provider     string
	Mode         string
	UserID       uint
	CodeVerifier string
}

type ProviderPublic struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

type ProviderConfig struct {
	ID           string
	Name         string
	Enabled      bool
	ClientID     string
	ClientSecret string
	AuthURL      string
	TokenURL     string
	UserInfoURL  string
	Scopes       string
}

type ExternalIdentity struct {
	Provider       string
	ProviderUserID string
	Email          string
	Name           string
	AvatarURL      string
}

type BindingDTO struct {
	ID             uint      `json:"id"`
	Provider       string    `json:"provider"`
	ProviderEmail  string    `json:"providerEmail"`
	ProviderName   string    `json:"providerName"`
	AvatarURL      string    `json:"avatarUrl"`
	CreatedAt      time.Time `json:"createdAt"`
}

func New(db *gorm.DB, settings SettingsReader) *Service {
	s := &Service{
		db:       db,
		settings: settings,
		http: &http.Client{
			Timeout: 15 * time.Second,
			// Never follow redirects on token/userinfo (SSRF / credential leakage).
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
	go s.cleanupLoop()
	return s
}

// AutoLinkByEmail reports whether OAuth logins may attach to existing users by email.
// Default is false (safer). Enable with oauth.auto_link_by_email=true.
func (s *Service) AutoLinkByEmail(ctx context.Context) bool {
	settings, err := s.settings.GetSettings(ctx)
	if err != nil {
		return false
	}
	return settings["oauth.auto_link_by_email"] == "true"
}

func (s *Service) SetDB(db *gorm.DB) {
	s.db = db
}

func (s *Service) SetSettings(settings SettingsReader) {
	s.settings = settings
}

func NormalizeRegistrationMode(raw string, allowRegistrationFallback bool) string {
	mode := strings.ToLower(strings.TrimSpace(raw))
	switch mode {
	case RegModeOpen, RegModeOAuthOnly, RegModeClosed:
		return mode
	}
	// Backward compatible with features.allow_registration
	if !allowRegistrationFallback {
		return RegModeClosed
	}
	return RegModeOpen
}

func (s *Service) RegistrationMode(ctx context.Context) string {
	settings, err := s.settings.GetSettings(ctx)
	if err != nil {
		return RegModeOpen
	}
	return NormalizeRegistrationMode(settings["features.registration_mode"], settings["features.allow_registration"] != "false")
}

func (s *Service) ListPublicProviders(ctx context.Context) ([]ProviderPublic, error) {
	configs, err := s.loadProviderConfigs(ctx)
	if err != nil {
		return nil, err
	}
	// Stable order for UI
	order := []string{"github", "google", "discord", "custom"}
	out := make([]ProviderPublic, 0, len(configs))
	seen := make(map[string]struct{}, len(configs))
	for _, id := range order {
		cfg, ok := configs[id]
		if !ok {
			continue
		}
		if !isProviderReady(cfg) {
			continue
		}
		out = append(out, ProviderPublic{
			ID:      cfg.ID,
			Name:    cfg.Name,
			Enabled: true,
		})
		seen[id] = struct{}{}
	}
	for id, cfg := range configs {
		if _, ok := seen[id]; ok {
			continue
		}
		if !isProviderReady(cfg) {
			continue
		}
		out = append(out, ProviderPublic{
			ID:      cfg.ID,
			Name:    cfg.Name,
			Enabled: true,
		})
	}
	return out, nil
}

func isProviderReady(cfg ProviderConfig) bool {
	if !cfg.Enabled || strings.TrimSpace(cfg.ClientID) == "" || strings.TrimSpace(cfg.ClientSecret) == "" {
		return false
	}
	// Custom / OIDC providers need absolute, non-private endpoint URLs.
	if cfg.ID == "custom" {
		return isSafeOutboundURL(cfg.AuthURL) &&
			isSafeOutboundURL(cfg.TokenURL) &&
			isSafeOutboundURL(cfg.UserInfoURL)
	}
	return isAbsoluteHTTPURL(cfg.AuthURL)
}

func isAbsoluteHTTPURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

// isSafeOutboundURL blocks obvious SSRF targets for admin-configured endpoints.
// Note: DNS rebinding is not fully prevented; prefer allowing only trusted IdPs.
func isSafeOutboundURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return false
	}
	host := u.Hostname()
	if host == "" {
		return false
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "metadata.google.internal" {
		return false
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		// Fail closed for custom endpoints when DNS fails.
		return false
	}
	if len(ips) == 0 {
		return false
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return false
		}
	}
	return true
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	// Allow private LAN for self-hosted IdPs (Casdoor etc.); still block loopback/metadata.
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		// 169.254.0.0/16 link-local / cloud metadata
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
	}
	return false
}

func (s *Service) GetProviderConfig(ctx context.Context, providerID string) (ProviderConfig, error) {
	configs, err := s.loadProviderConfigs(ctx)
	if err != nil {
		return ProviderConfig{}, err
	}
	cfg, ok := configs[strings.ToLower(strings.TrimSpace(providerID))]
	if !ok {
		return ProviderConfig{}, ErrProviderUnknown
	}
	if !isProviderReady(cfg) {
		return ProviderConfig{}, ErrProviderDisabled
	}
	return cfg, nil
}

func (s *Service) loadProviderConfigs(ctx context.Context) (map[string]ProviderConfig, error) {
	settings, err := s.settings.GetSettings(ctx)
	if err != nil {
		return nil, err
	}
	if settings["oauth.enabled"] != "true" {
		return map[string]ProviderConfig{}, nil
	}

	builtins := []struct {
		id, name, authURL, tokenURL, userInfoURL, scopes string
	}{
		{
			id: "github", name: "GitHub",
			authURL: "https://github.com/login/oauth/authorize",
			tokenURL: "https://github.com/login/oauth/access_token",
			userInfoURL: "https://api.github.com/user",
			scopes: "read:user user:email",
		},
		{
			id: "google", name: "Google",
			authURL: "https://accounts.google.com/o/oauth2/v2/auth",
			tokenURL: "https://oauth2.googleapis.com/token",
			userInfoURL: "https://openidconnect.googleapis.com/v1/userinfo",
			scopes: "openid email profile",
		},
		{
			id: "discord", name: "Discord",
			authURL: "https://discord.com/api/oauth2/authorize",
			tokenURL: "https://discord.com/api/oauth2/token",
			userInfoURL: "https://discord.com/api/users/@me",
			scopes: "identify email",
		},
	}

	result := make(map[string]ProviderConfig, len(builtins)+1)
	for _, b := range builtins {
		prefix := "oauth." + b.id + "."
		cfg := ProviderConfig{
			ID:           b.id,
			Name:         b.name,
			Enabled:      settings[prefix+"enabled"] == "true",
			ClientID:     strings.TrimSpace(settings[prefix+"client_id"]),
			ClientSecret: strings.TrimSpace(settings[prefix+"client_secret"]),
			AuthURL:      b.authURL,
			TokenURL:     b.tokenURL,
			UserInfoURL:  b.userInfoURL,
			Scopes:       b.scopes,
		}
		result[b.id] = cfg
	}

	// Custom OIDC-like provider (same shape as builtins; readiness checked by isProviderReady)
	customPrefix := "oauth.custom."
	result["custom"] = ProviderConfig{
		ID:           "custom",
		Name:         firstNonEmpty(strings.TrimSpace(settings[customPrefix+"name"]), "OAuth"),
		Enabled:      settings[customPrefix+"enabled"] == "true",
		ClientID:     strings.TrimSpace(settings[customPrefix+"client_id"]),
		ClientSecret: strings.TrimSpace(settings[customPrefix+"client_secret"]),
		AuthURL:      strings.TrimSpace(settings[customPrefix+"auth_url"]),
		TokenURL:     strings.TrimSpace(settings[customPrefix+"token_url"]),
		UserInfoURL:  strings.TrimSpace(settings[customPrefix+"userinfo_url"]),
		Scopes:       firstNonEmpty(strings.TrimSpace(settings[customPrefix+"scopes"]), "openid email profile"),
	}

	return result, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// CreateState persists CSRF state + PKCE verifier (DB-backed for multi-instance).
func (s *Service) CreateState(ctx context.Context, provider, mode string, userID uint) (state string, codeVerifier string, err error) {
	mode = strings.ToLower(strings.TrimSpace(mode))
	if mode != ModeBind {
		mode = ModeLogin
	}
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	state = hex.EncodeToString(buf)
	codeVerifier, err = generateCodeVerifier()
	if err != nil {
		return "", "", err
	}
	entry := data.OAuthState{
		ID:           state,
		Provider:     strings.ToLower(strings.TrimSpace(provider)),
		Mode:         mode,
		UserID:       userID,
		CodeVerifier: codeVerifier,
		ExpiresAt:    time.Now().Add(10 * time.Minute),
	}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		return "", "", err
	}
	return state, codeVerifier, nil
}

func (s *Service) ConsumeState(ctx context.Context, state string) (*PendingState, error) {
	state = strings.TrimSpace(state)
	if state == "" {
		return nil, ErrInvalidState
	}
	var entry data.OAuthState
	err := s.db.WithContext(ctx).Where("id = ?", state).First(&entry).Error
	if err != nil {
		return nil, ErrInvalidState
	}
	// One-time use
	_ = s.db.WithContext(ctx).Delete(&data.OAuthState{}, "id = ?", state).Error
	if time.Now().After(entry.ExpiresAt) {
		return nil, ErrInvalidState
	}
	return &PendingState{
		Provider:     entry.Provider,
		Mode:         entry.Mode,
		UserID:       entry.UserID,
		CodeVerifier: entry.CodeVerifier,
	}, nil
}

func generateCodeVerifier() (string, error) {
	// RFC 7636: 43-128 chars from unreserved set; 32 random bytes -> 43 base64url chars.
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func codeChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (s *Service) BuildAuthURL(cfg ProviderConfig, redirectURI, state, codeVerifier string) (string, error) {
	authURL := strings.TrimSpace(cfg.AuthURL)
	if !isAbsoluteHTTPURL(authURL) {
		return "", fmt.Errorf("invalid oauth auth url")
	}
	if strings.TrimSpace(cfg.ClientID) == "" {
		return "", fmt.Errorf("oauth client_id is empty")
	}
	// Strip any accidental query/fragment from the configured base authorize URL.
	base, err := url.Parse(authURL)
	if err != nil {
		return "", fmt.Errorf("invalid oauth auth url")
	}
	base.RawQuery = ""
	base.Fragment = ""

	params := url.Values{}
	params.Set("client_id", strings.TrimSpace(cfg.ClientID))
	params.Set("redirect_uri", redirectURI)
	params.Set("response_type", "code")
	params.Set("scope", firstNonEmpty(strings.TrimSpace(cfg.Scopes), "openid profile email"))
	params.Set("state", state)
	if codeVerifier != "" {
		params.Set("code_challenge", codeChallengeS256(codeVerifier))
		params.Set("code_challenge_method", "S256")
	}
	if cfg.ID == "google" {
		params.Set("access_type", "online")
		params.Set("prompt", "select_account")
	}
	base.RawQuery = params.Encode()
	return base.String(), nil
}

func (s *Service) ExchangeAndFetchIdentity(ctx context.Context, cfg ProviderConfig, code, redirectURI, codeVerifier string) (ExternalIdentity, error) {
	token, err := s.exchangeCode(ctx, cfg, code, redirectURI, codeVerifier)
	if err != nil {
		return ExternalIdentity{}, err
	}
	return s.fetchIdentity(ctx, cfg, token)
}

func (s *Service) exchangeCode(ctx context.Context, cfg ProviderConfig, code, redirectURI, codeVerifier string) (string, error) {
	if cfg.ID == "custom" && !isSafeOutboundURL(cfg.TokenURL) {
		return "", errors.New("unsafe oauth token url")
	}
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")
	if strings.TrimSpace(codeVerifier) != "" {
		form.Set("code_verifier", codeVerifier)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("token exchange failed: %s", strings.TrimSpace(string(body)))
	}

	// GitHub may return form-encoded when Accept is missing; we force JSON via Accept.
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		// fallback form-encoded
		values, err2 := url.ParseQuery(string(body))
		if err2 != nil {
			return "", fmt.Errorf("parse token response: %w", err)
		}
		token := values.Get("access_token")
		if token == "" {
			return "", errors.New("missing access_token")
		}
		return token, nil
	}
	token, _ := payload["access_token"].(string)
	if token == "" {
		return "", errors.New("missing access_token")
	}
	return token, nil
}

func (s *Service) fetchIdentity(ctx context.Context, cfg ProviderConfig, accessToken string) (ExternalIdentity, error) {
	if cfg.ID == "custom" && !isSafeOutboundURL(cfg.UserInfoURL) {
		return ExternalIdentity{}, errors.New("unsafe oauth userinfo url")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.UserInfoURL, nil)
	if err != nil {
		return ExternalIdentity{}, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	if cfg.ID == "github" {
		req.Header.Set("User-Agent", "skyimage-oauth")
	}

	resp, err := s.http.Do(req)
	if err != nil {
		return ExternalIdentity{}, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ExternalIdentity{}, fmt.Errorf("userinfo failed: %s", strings.TrimSpace(string(body)))
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return ExternalIdentity{}, err
	}

	identity := ExternalIdentity{Provider: cfg.ID}
	switch cfg.ID {
	case "github":
		identity.ProviderUserID = fmt.Sprintf("%.0f", asFloat(raw["id"]))
		if identity.ProviderUserID == "0" {
			identity.ProviderUserID = strings.TrimSpace(fmt.Sprint(raw["id"]))
		}
		identity.Name = firstNonEmpty(asString(raw["name"]), asString(raw["login"]))
		// Prefer verified primary email from /user/emails; ignore unverified public email.
		identity.Email = s.fetchGitHubPrimaryEmail(ctx, accessToken)
		if identity.Email == "" {
			if email := strings.ToLower(strings.TrimSpace(asString(raw["email"]))); emailLooksValid(email) {
				// Public profile email may be unverified; do not use for account linking.
				// Keep empty so auto-bind is skipped; still create a synthetic local email later.
				_ = email
			}
		}
		identity.AvatarURL = asString(raw["avatar_url"])
	case "google":
		identity.ProviderUserID = asString(raw["sub"])
		if email := strings.ToLower(strings.TrimSpace(asString(raw["email"]))); emailLooksValid(email) && emailVerifiedClaim(raw) {
			identity.Email = email
		}
		identity.Name = firstNonEmpty(asString(raw["name"]), strings.Split(identity.Email, "@")[0])
		identity.AvatarURL = asString(raw["picture"])
	case "discord":
		identity.ProviderUserID = asString(raw["id"])
		// Discord email is only returned when verified for the scope.
		if email := strings.ToLower(strings.TrimSpace(asString(raw["email"]))); emailLooksValid(email) {
			identity.Email = email
		}
		identity.Name = firstNonEmpty(asString(raw["global_name"]), asString(raw["username"]))
		if avatar := asString(raw["avatar"]); avatar != "" && identity.ProviderUserID != "" {
			identity.AvatarURL = fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.png", identity.ProviderUserID, avatar)
		}
	default:
		identity.ProviderUserID = firstNonEmpty(asString(raw["sub"]), asString(raw["id"]), fmt.Sprintf("%.0f", asFloat(raw["id"])))
		// Only trust email claim when provider marks it verified (or omits the flag).
		email := strings.ToLower(strings.TrimSpace(asString(raw["email"])))
		if email != "" && emailLooksValid(email) && emailVerifiedClaim(raw) {
			identity.Email = email
		}
		identity.Name = firstNonEmpty(asString(raw["name"]), asString(raw["preferred_username"]), asString(raw["login"]), asString(raw["username"]))
		identity.AvatarURL = firstNonEmpty(asString(raw["picture"]), asString(raw["avatar_url"]))
	}

	if identity.ProviderUserID == "" || identity.ProviderUserID == "0" {
		return ExternalIdentity{}, errors.New("oauth identity missing user id")
	}
	if identity.Name == "" {
		identity.Name = "user_" + identity.ProviderUserID
	}
	// Never treat free-form names as emails for account linking.
	if identity.Email != "" && !emailLooksValid(identity.Email) {
		identity.Email = ""
	}
	return identity, nil
}

func emailLooksValid(email string) bool {
	email = strings.TrimSpace(email)
	if email == "" || len(email) > 255 || strings.ContainsAny(email, " \t\r\n") {
		return false
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at >= len(email)-1 {
		return false
	}
	return strings.Contains(email[at+1:], ".")
}

// emailVerifiedClaim returns true when email_verified is absent/true, false when explicitly false.
func emailVerifiedClaim(raw map[string]interface{}) bool {
	v, ok := raw["email_verified"]
	if !ok {
		// Many IdPs omit the claim for already-verified directory emails.
		return true
	}
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return strings.EqualFold(strings.TrimSpace(t), "true") || t == "1"
	case float64:
		return t != 0
	default:
		return false
	}
}

func (s *Service) fetchGitHubPrimaryEmail(ctx context.Context, accessToken string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "skyimage-oauth")
	resp, err := s.http.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ""
	}
	var emails []map[string]interface{}
	if err := json.Unmarshal(body, &emails); err != nil {
		return ""
	}
	var fallback string
	for _, item := range emails {
		email := strings.ToLower(strings.TrimSpace(asString(item["email"])))
		if email == "" {
			continue
		}
		if item["primary"] == true && item["verified"] == true {
			return email
		}
		if fallback == "" && item["verified"] == true {
			fallback = email
		}
	}
	return fallback
}

func asString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprintf("%.0f", t)
		}
		return fmt.Sprintf("%v", t)
	case json.Number:
		return t.String()
	default:
		if v == nil {
			return ""
		}
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func asFloat(v interface{}) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		return 0
	}
}

func (s *Service) CompleteLogin(ctx context.Context, identity ExternalIdentity, registeredIP string) (data.User, error) {
	// Existing binding
	var binding data.UserOAuthBinding
	err := s.db.WithContext(ctx).
		Where("provider = ? AND provider_user_id = ?", identity.Provider, identity.ProviderUserID).
		First(&binding).Error
	if err == nil {
		user, err := s.getUser(ctx, binding.UserID)
		if err != nil {
			return data.User{}, err
		}
		if user.Status == 0 {
			return data.User{}, ErrAccountDisabled
		}
		_ = s.db.WithContext(ctx).Model(&binding).Updates(map[string]interface{}{
			"provider_email": identity.Email,
			"provider_name":  identity.Name,
			"avatar_url":     identity.AvatarURL,
		}).Error
		return user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return data.User{}, err
	}

	// Optional auto-link by email (OFF by default to prevent account takeover).
	if s.AutoLinkByEmail(ctx) &&
		identity.Email != "" &&
		emailLooksValid(identity.Email) &&
		!strings.HasSuffix(identity.Email, "@oauth.local") {
		var user data.User
		if err := s.db.WithContext(ctx).Where("LOWER(email) = ?", identity.Email).First(&user).Error; err == nil {
			if user.Status == 0 {
				return data.User{}, ErrAccountDisabled
			}
			if err := s.createBinding(ctx, user.ID, identity); err != nil {
				return data.User{}, err
			}
			return user, nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return data.User{}, err
		}
	}

	// Create new user if registration mode allows
	mode := s.RegistrationMode(ctx)
	if mode == RegModeClosed {
		return data.User{}, ErrRegistrationClosed
	}
	// open and oauth_only both allow OAuth registration

	return s.createUserFromOAuth(ctx, identity, registeredIP)
}

func (s *Service) BindToUser(ctx context.Context, userID uint, identity ExternalIdentity) error {
	var existing data.UserOAuthBinding
	err := s.db.WithContext(ctx).
		Where("provider = ? AND provider_user_id = ?", identity.Provider, identity.ProviderUserID).
		First(&existing).Error
	if err == nil {
		if existing.UserID != userID {
			return ErrBindingExists
		}
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	// Same provider already bound to this user?
	var sameProvider int64
	if err := s.db.WithContext(ctx).Model(&data.UserOAuthBinding{}).
		Where("user_id = ? AND provider = ?", userID, identity.Provider).
		Count(&sameProvider).Error; err != nil {
		return err
	}
	if sameProvider > 0 {
		return ErrBindingExists
	}

	return s.createBinding(ctx, userID, identity)
}

func (s *Service) ListBindings(ctx context.Context, userID uint) ([]BindingDTO, error) {
	var rows []data.UserOAuthBinding
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]BindingDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, BindingDTO{
			ID:            row.ID,
			Provider:      row.Provider,
			ProviderEmail: row.ProviderEmail,
			ProviderName:  row.ProviderName,
			AvatarURL:     row.AvatarURL,
			CreatedAt:     row.CreatedAt,
		})
	}
	return out, nil
}

func (s *Service) Unbind(ctx context.Context, userID uint, provider string) error {
	provider = strings.ToLower(strings.TrimSpace(provider))
	var binding data.UserOAuthBinding
	if err := s.db.WithContext(ctx).Where("user_id = ? AND provider = ?", userID, provider).First(&binding).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrBindingNotFound
		}
		return err
	}
	return s.db.WithContext(ctx).Delete(&binding).Error
}

func (s *Service) createBinding(ctx context.Context, userID uint, identity ExternalIdentity) error {
	binding := data.UserOAuthBinding{
		UserID:         userID,
		Provider:       identity.Provider,
		ProviderUserID: identity.ProviderUserID,
		ProviderEmail:  identity.Email,
		ProviderName:   identity.Name,
		AvatarURL:      identity.AvatarURL,
	}
	if err := s.db.WithContext(ctx).Create(&binding).Error; err != nil {
		if isUniqueErr(err) {
			return ErrBindingExists
		}
		return err
	}
	return nil
}

func (s *Service) createUserFromOAuth(ctx context.Context, identity ExternalIdentity, registeredIP string) (data.User, error) {
	email := strings.ToLower(strings.TrimSpace(identity.Email))
	if email == "" {
		email = fmt.Sprintf("%s_%s@oauth.local", identity.Provider, identity.ProviderUserID)
	}

	// Ensure unique email
	var count int64
	if err := s.db.WithContext(ctx).Model(&data.User{}).Where("LOWER(email) = ?", email).Count(&count).Error; err != nil {
		return data.User{}, err
	}
	if count > 0 {
		email = fmt.Sprintf("%s_%s@oauth.local", identity.Provider, identity.ProviderUserID)
	}

	name := strings.TrimSpace(identity.Name)
	if len(name) > 128 {
		name = name[:128]
	}
	if name == "" {
		name = "user_" + identity.ProviderUserID
	}
	user := data.User{
		Name:         name,
		Email:        email,
		PasswordHash: "", // OAuth-only until user sets a password
		Configs:      datatypes.JSON([]byte(`{}`)),
		Status:       1,
		RegisteredIP: registeredIP,
	}
	if group, err := s.defaultGroup(ctx); err == nil && group != nil {
		user.GroupID = &group.ID
	}

	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := users.CreateUserWithGeneratedID(tx, &user); err != nil {
			return err
		}
		binding := data.UserOAuthBinding{
			UserID:         user.ID,
			Provider:       identity.Provider,
			ProviderUserID: identity.ProviderUserID,
			ProviderEmail:  identity.Email,
			ProviderName:   identity.Name,
			AvatarURL:      identity.AvatarURL,
		}
		return tx.Create(&binding).Error
	}); err != nil {
		return data.User{}, err
	}
	_ = s.db.WithContext(ctx).Preload("Group").First(&user, user.ID)
	return user, nil
}

func (s *Service) getUser(ctx context.Context, id uint) (data.User, error) {
	var user data.User
	if err := s.db.WithContext(ctx).Preload("Group").First(&user, id).Error; err != nil {
		return data.User{}, err
	}
	return user, nil
}

func (s *Service) defaultGroup(ctx context.Context) (*data.Group, error) {
	var group data.Group
	if err := s.db.WithContext(ctx).Where("is_default = ?", true).First(&group).Error; err != nil {
		return nil, err
	}
	return &group, nil
}

func isUniqueErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "duplicate entry") ||
		strings.Contains(msg, "duplicated key") ||
		strings.Contains(msg, "duplicate key value")
}

func (s *Service) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		if s.db == nil {
			continue
		}
		_ = s.db.Where("expires_at < ?", time.Now()).Delete(&data.OAuthState{}).Error
	}
}
