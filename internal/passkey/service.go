package passkey

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

const (
	// ActionRegister and ActionLogin describe a stored challenge ceremony type.
	ActionRegister = "register"
	ActionLogin    = "login"

	// ConfigKeyEnabled is the admin setting controlling whether passkeys are usable.
	ConfigKeyEnabled = "features.passkeys_enabled"

	challengeTTL  = 5 * time.Minute
	defaultRPName = "SkyImage"
)

var (
	ErrDisabled       = errors.New("passkeys disabled")
	ErrInvalidSession = errors.New("invalid or expired passkey session")
	ErrUnknownCred    = errors.New("unknown passkey credential")
	ErrDuplicateCred  = errors.New("passkey already registered")
	ErrInvalidName    = errors.New("invalid passkey name")
)

// SettingsReader exposes the admin settings store (implemented by *admin.Service).
type SettingsReader interface {
	GetSettings(ctx context.Context) (map[string]string, error)
}

// Service implements WebAuthn (Passkey) registration and usernameless login.
type Service struct {
	db              *gorm.DB
	settings        SettingsReader
	fallbackBaseURL string

	mu          sync.Mutex
	stopCleanup chan struct{}
}

// webUser adapts a data.User to the webauthn.User interface.
type webUser struct {
	id          []byte
	name        string
	displayName string
	creds       []webauthn.Credential
}

func (u *webUser) WebAuthnID() []byte                        { return u.id }
func (u *webUser) WebAuthnName() string                      { return u.name }
func (u *webUser) WebAuthnDisplayName() string               { return u.displayName }
func (u *webUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

// PasskeyDTO is the public representation of a stored passkey.
type PasskeyDTO struct {
	ID         uint       `json:"id"`
	Name       string     `json:"name"`
	CredentialID string   `json:"credentialId"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
}

func New(db *gorm.DB, settings SettingsReader, fallbackBaseURL string) *Service {
	s := &Service{
		db:              db,
		settings:        settings,
		fallbackBaseURL: fallbackBaseURL,
		stopCleanup:     make(chan struct{}),
	}
	go s.cleanupLoop()
	return s
}

// SetDB updates the database handle after a runtime database switch.
func (s *Service) SetDB(db *gorm.DB) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.db = db
}

// SetSettings updates the settings reader after a runtime database switch.
func (s *Service) SetSettings(settings SettingsReader) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.settings = settings
}

// Enabled reports whether passkeys are turned on in admin settings.
func (s *Service) Enabled(ctx context.Context) bool {
	if s.settings == nil {
		return true
	}
	settings, err := s.settings.GetSettings(ctx)
	if err != nil {
		return true
	}
	return settings[ConfigKeyEnabled] != "false"
}

// rpConfig resolves the relying party identity (RPID + allowed origins).
// The RPID always comes from configuration (site.console_url → PUBLIC_BASE_URL)
// so passkeys survive Host-header changes. The request origin is only added to
// the allowed-origins list to keep localhost development working across ports.
func (s *Service) rpConfig(ctx context.Context, requestOrigin string) (string, []string, error) {
	base := ""
	if s.settings != nil {
		if settings, err := s.settings.GetSettings(ctx); err == nil {
			base = strings.TrimSpace(settings["site.console_url"])
		}
	}
	if base == "" {
		base = s.fallbackBaseURL
	}
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", nil, errors.New("invalid relying party base url")
	}
	origin := u.Scheme + "://" + u.Host
	origins := []string{origin}
	if ro := strings.TrimSpace(requestOrigin); ro != "" && ro != origin {
		origins = append(origins, ro)
	}
	return u.Hostname(), origins, nil
}

func (s *Service) newWebAuthn(ctx context.Context, requestOrigin, siteName string) (*webauthn.WebAuthn, error) {
	rpID, origins, err := s.rpConfig(ctx, requestOrigin)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(siteName) == "" {
		siteName = defaultRPName
	}
	return webauthn.New(&webauthn.Config{
		RPID:          rpID,
		RPDisplayName: siteName,
		RPOrigins:     origins,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:       protocol.ResidentKeyRequirementRequired,
			UserVerification:  protocol.VerificationPreferred,
		},
	})
}

// webUserFor builds a webauthn.User adapter for the given user, optionally
// loading their stored credentials.
func (s *Service) webUserFor(ctx context.Context, user data.User, withCreds bool) (*webUser, error) {
	u := &webUser{
		id:          []byte(user.Email),
		name:        user.Email,
		displayName: user.Name,
	}
	if withCreds {
		creds, err := s.loadCredentials(ctx, user.ID)
		if err != nil {
			return nil, err
		}
		u.creds = creds
	}
	return u, nil
}

// BeginRegistration creates registration options and persists the ceremony
// session. Returns the options to send to the browser.
func (s *Service) BeginRegistration(ctx context.Context, userID uint, requestOrigin, siteName string) (*protocol.CredentialCreation, error) {
	user, err := s.loadUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	wu, err := s.webUserFor(ctx, user, true)
	if err != nil {
		return nil, err
	}
	wa, err := s.newWebAuthn(ctx, requestOrigin, siteName)
	if err != nil {
		return nil, err
	}
	options, session, err := wa.BeginRegistration(wu)
	if err != nil {
		return nil, err
	}
	if err := s.storeChallenge(ctx, session.Challenge, userID, ActionRegister, session); err != nil {
		return nil, err
	}
	return options, nil
}

// FinishRegistration validates the attestation response and stores the new
// credential bound to userID. The challenge is extracted from the response's
// clientDataJSON so no extra client round-trip state is required.
func (s *Service) FinishRegistration(ctx context.Context, userID uint, requestOrigin, siteName string, rawJSON []byte) (*data.UserPasskey, error) {
	parsed, err := protocol.ParseCredentialCreationResponseBytes(rawJSON)
	if err != nil {
		return nil, err
	}
	session, err := s.consumeChallenge(ctx, parsed.Response.CollectedClientData.Challenge, ActionRegister, userID)
	if err != nil {
		return nil, err
	}
	user, err := s.loadUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	wu, err := s.webUserFor(ctx, user, true)
	if err != nil {
		return nil, err
	}
	wa, err := s.newWebAuthn(ctx, requestOrigin, siteName)
	if err != nil {
		return nil, err
	}
	cred, err := wa.CreateCredential(wu, *session, parsed)
	if err != nil {
		return nil, err
	}
	credBytes, err := json.Marshal(cred)
	if err != nil {
		return nil, err
	}
	var count int64
	if err := s.db.WithContext(ctx).Model(&data.UserPasskey{}).
		Where("user_id = ?", userID).
		Count(&count).Error; err != nil {
		return nil, err
	}
	name := "Passkey"
	if count > 0 {
		encoded := base64.RawURLEncoding.EncodeToString(cred.ID)
		if len(encoded) > 8 {
			encoded = encoded[:8]
		}
		name = "Passkey " + encoded
	}
	entry := data.UserPasskey{
		UserID:     userID,
		Name:       name,
		Credential: string(credBytes),
	}
	if err := s.db.WithContext(ctx).Create(&entry).Error; err != nil {
		if isUniqueConstraintError(err) {
			return nil, ErrDuplicateCred
		}
		return nil, err
	}
	return &entry, nil
}

// BeginLogin creates assertion options for a discoverable (usernameless)
// passkey login.
func (s *Service) BeginLogin(ctx context.Context, requestOrigin, siteName string) (*protocol.CredentialAssertion, error) {
	wa, err := s.newWebAuthn(ctx, requestOrigin, siteName)
	if err != nil {
		return nil, err
	}
	assertion, session, err := wa.BeginDiscoverableLogin()
	if err != nil {
		return nil, err
	}
	if err := s.storeChallenge(ctx, session.Challenge, 0, ActionLogin, session); err != nil {
		return nil, err
	}
	return assertion, nil
}

// FinishLogin validates the discoverable assertion, resolves the owning user,
// updates the credential sign count, and returns the user.
func (s *Service) FinishLogin(ctx context.Context, requestOrigin, siteName string, rawJSON []byte) (data.User, *data.UserPasskey, error) {
	parsed, err := protocol.ParseCredentialRequestResponseBytes(rawJSON)
	if err != nil {
		return data.User{}, nil, err
	}
	session, err := s.consumeChallenge(ctx, parsed.Response.CollectedClientData.Challenge, ActionLogin, 0)
	if err != nil {
		return data.User{}, nil, err
	}
	wa, err := s.newWebAuthn(ctx, requestOrigin, siteName)
	if err != nil {
		return data.User{}, nil, err
	}
	handler := func(rawID, userHandle []byte) (webauthn.User, error) {
		entry, err := s.findByCredentialID(ctx, rawID)
		if err != nil {
			return nil, err
		}
		user, err := s.loadUser(ctx, entry.UserID)
		if err != nil {
			return nil, err
		}
		creds, err := s.loadCredentials(ctx, entry.UserID)
		if err != nil {
			return nil, err
		}
		return &webUser{
			id:          []byte(user.Email),
			name:        user.Email,
			displayName: user.Name,
			creds:       creds,
		}, nil
	}
	_, cred, err := wa.ValidatePasskeyLogin(handler, *session, parsed)
	if err != nil {
		return data.User{}, nil, err
	}
	if cred.Authenticator.CloneWarning {
		return data.User{}, nil, errors.New("possible cloned authenticator")
	}
	entry, err := s.findByCredentialID(ctx, cred.ID)
	if err != nil {
		return data.User{}, nil, err
	}
	// Persist the updated credential (sign counter / flags) and last-used time.
	updated, err := json.Marshal(cred)
	if err != nil {
		return data.User{}, nil, err
	}
	now := time.Now()
	if err := s.db.WithContext(ctx).Model(&data.UserPasskey{}).
		Where("id = ?", entry.ID).
		Updates(map[string]interface{}{
			"credential":   string(updated),
			"last_used_at": now,
		}).Error; err != nil {
		return data.User{}, nil, err
	}
	user, err := s.loadUser(ctx, entry.UserID)
	if err != nil {
		return data.User{}, nil, err
	}
	entry.LastUsedAt = &now
	return user, entry, nil
}

// List returns the passkeys owned by userID.
func (s *Service) List(ctx context.Context, userID uint) ([]data.UserPasskey, error) {
	var items []data.UserPasskey
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at ASC").
		Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ToDTO converts a stored passkey into its public representation.
func (s *Service) ToDTO(entry data.UserPasskey) (PasskeyDTO, error) {
	cred, err := decodeCredential(entry.Credential)
	if err != nil {
		return PasskeyDTO{}, err
	}
	return PasskeyDTO{
		ID:           entry.ID,
		Name:         entry.Name,
		CredentialID: base64.RawURLEncoding.EncodeToString(cred.ID),
		CreatedAt:    entry.CreatedAt,
		LastUsedAt:   entry.LastUsedAt,
	}, nil
}

// Rename updates the display name of a passkey owned by userID.
func (s *Service) Rename(ctx context.Context, userID, id uint, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return ErrInvalidName
	}
	if len([]rune(name)) > 128 {
		return ErrInvalidName
	}
	result := s.db.WithContext(ctx).
		Model(&data.UserPasskey{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("name", name)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// Delete removes a passkey owned by userID.
func (s *Service) Delete(ctx context.Context, userID, id uint) error {
	result := s.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&data.UserPasskey{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// --- internal helpers ---

func (s *Service) loadUser(ctx context.Context, userID uint) (data.User, error) {
	var user data.User
	if err := s.db.WithContext(ctx).First(&user, userID).Error; err != nil {
		return data.User{}, err
	}
	return user, nil
}

func (s *Service) loadCredentials(ctx context.Context, userID uint) ([]webauthn.Credential, error) {
	var items []data.UserPasskey
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Find(&items).Error; err != nil {
		return nil, err
	}
	creds := make([]webauthn.Credential, 0, len(items))
	for _, item := range items {
		cred, err := decodeCredential(item.Credential)
		if err != nil {
			log.Printf("[passkey] failed to decode credential %d: %v", item.ID, err)
			continue
		}
		creds = append(creds, *cred)
	}
	return creds, nil
}

func (s *Service) findByCredentialID(ctx context.Context, rawID []byte) (*data.UserPasskey, error) {
	target := base64.RawURLEncoding.EncodeToString(rawID)
	var items []data.UserPasskey
	if err := s.db.WithContext(ctx).Find(&items).Error; err != nil {
		return nil, err
	}
	for i := range items {
		cred, err := decodeCredential(items[i].Credential)
		if err != nil {
			continue
		}
		if base64.RawURLEncoding.EncodeToString(cred.ID) == target {
			return &items[i], nil
		}
	}
	return nil, ErrUnknownCred
}

func (s *Service) storeChallenge(ctx context.Context, challenge string, userID uint, action string, session *webauthn.SessionData) error {
	bytes, err := json.Marshal(session)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Create(&data.PasskeyChallenge{
		ID:          challenge,
		UserID:      userID,
		Action:      action,
		SessionData: string(bytes),
		ExpiresAt:   time.Now().Add(challengeTTL),
	}).Error
}

func (s *Service) consumeChallenge(ctx context.Context, challenge, action string, userID uint) (*webauthn.SessionData, error) {
	var entry data.PasskeyChallenge
	if err := s.db.WithContext(ctx).
		Where("id = ? AND action = ?", challenge, action).
		First(&entry).Error; err != nil {
		return nil, ErrInvalidSession
	}
	if time.Now().After(entry.ExpiresAt) {
		_ = s.db.WithContext(ctx).Delete(&data.PasskeyChallenge{}, "id = ?", challenge).Error
		return nil, ErrInvalidSession
	}
	if userID != 0 && entry.UserID != userID {
		return nil, ErrInvalidSession
	}
	if action == ActionRegister && entry.UserID == 0 {
		return nil, ErrInvalidSession
	}
	var session webauthn.SessionData
	if err := json.Unmarshal([]byte(entry.SessionData), &session); err != nil {
		return nil, ErrInvalidSession
	}
	_ = s.db.WithContext(ctx).Delete(&data.PasskeyChallenge{}, "id = ?", challenge).Error
	return &session, nil
}

func (s *Service) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCleanup:
			return
		case <-ticker.C:
			s.mu.Lock()
			db := s.db
			s.mu.Unlock()
			if db == nil {
				continue
			}
			if err := db.WithContext(context.Background()).
				Delete(&data.PasskeyChallenge{}, "expires_at < ?", time.Now()).Error; err != nil {
				log.Printf("[passkey] cleanup failed: %v", err)
			}
		}
	}
}

func decodeCredential(raw string) (*webauthn.Credential, error) {
	var cred webauthn.Credential
	if err := json.Unmarshal([]byte(raw), &cred); err != nil {
		return nil, err
	}
	return &cred, nil
}

func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "unique constraint") ||
		strings.Contains(message, "duplicate entry") ||
		strings.Contains(message, "duplicated key") ||
		strings.Contains(message, "duplicate key value")
}
