package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/admin"
	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/passkey"
	"skyimage/internal/session"
	"skyimage/internal/users"
)

func newPasskeyTestServer(t *testing.T) (*Server, *gin.Engine, *gorm.DB, data.User) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	if err := db.AutoMigrate(
		&data.User{}, &data.Group{}, &data.UserPasskey{},
		&data.PasskeyChallenge{}, &data.SessionEntry{}, &data.ConfigEntry{}, &data.FileAsset{},
	); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	adminSvc := admin.New(db)
	usersSvc := users.New(db)

	s := &Server{
		db:          db,
		cfg:         config.Config{AllowRegistration: true, PublicBaseURL: "http://localhost:8080"},
		admin:       adminSvc,
		users:       usersSvc,
		passkeys:    passkey.New(db, adminSvc, "http://localhost:8080"),
		authLimiter: newRequestLimiter(),
		session:     session.NewManager(db, 24*time.Hour),
	}

	user := data.User{
		Name:         "Test User",
		Email:        "test@example.com",
		PasswordHash: "x",
		Status:       1,
		IsSuperAdmin: true,
	}
	if err := users.CreateUserWithGeneratedID(db, &user); err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	engine := gin.New()
	group := engine.Group("/api")
	s.registerPasskeyRoutes(group)

	return s, engine, db, user
}

func authenticatedRequest(s *Server, engine *gin.Engine, user data.User, method, path string, payload any) *httptest.ResponseRecorder {
	var body []byte
	if payload != nil {
		body, _ = json.Marshal(payload)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-Token", "csrf")
	req.RemoteAddr = "127.0.0.1:12345"

	sessionID, _ := s.session.Create(user.ID)
	req.AddCookie(&http.Cookie{Name: session.CookieName, Value: sessionID, Path: "/"})
	req.AddCookie(&http.Cookie{Name: "skyimage_csrf", Value: "csrf", Path: "/"})

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)
	return recorder
}

func TestHandlePasskeyUnauthenticated(t *testing.T) {
	_, engine, _, _ := newPasskeyTestServer(t)

	for _, tc := range []struct {
		method string
		path   string
	}{
		{"POST", "/api/auth/passkeys/register/begin"},
		{"POST", "/api/auth/passkeys/register/complete"},
		{"GET", "/api/auth/passkeys"},
		{"PATCH", "/api/auth/passkeys/1"},
		{"DELETE", "/api/auth/passkeys/1"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: expected 401, got %d", tc.method, tc.path, recorder.Code)
		}
	}
}

func TestHandlePasskeyDisabled(t *testing.T) {
	_, engine, db, _ := newPasskeyTestServer(t)
	if err := db.Create(&data.ConfigEntry{Key: passkey.ConfigKeyEnabled, Value: "false"}).Error; err != nil {
		t.Fatalf("failed to disable passkeys: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/auth/passkeys/login/begin", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when disabled, got %d", recorder.Code)
	}
}

func TestHandlePasskeyLoginBegin(t *testing.T) {
	_, engine, _, _ := newPasskeyTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/passkeys/login/begin", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var resp struct {
		Data struct {
			PublicKey struct {
				Challenge string `json:"challenge"`
			} `json:"publicKey"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid response: %v", err)
	}
	if resp.Data.PublicKey.Challenge == "" {
		t.Fatalf("expected a challenge in assertion options")
	}
}

func TestHandlePasskeyRegisterBeginAndList(t *testing.T) {
	s, engine, _, user := newPasskeyTestServer(t)

	recorder := authenticatedRequest(s, engine, user, http.MethodPost, "/api/auth/passkeys/register/begin", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("register begin expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var resp struct {
		Data struct {
			PublicKey struct {
				Challenge    string `json:"challenge"`
				RelyingParty struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				} `json:"rp"`
			} `json:"publicKey"`
		} `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid register begin response: %v", err)
	}
	if resp.Data.PublicKey.Challenge == "" {
		t.Fatalf("expected a challenge")
	}
	if resp.Data.PublicKey.RelyingParty.ID != "localhost" {
		t.Fatalf("expected RPID localhost, got %q", resp.Data.PublicKey.RelyingParty.ID)
	}

	listRecorder := authenticatedRequest(s, engine, user, http.MethodGet, "/api/auth/passkeys", nil)
	if listRecorder.Code != http.StatusOK {
		t.Fatalf("list expected 200, got %d", listRecorder.Code)
	}
	if body := listRecorder.Body.String(); body == "" {
		t.Fatalf("expected empty passkey list, got empty body")
	}
}

func TestHandlePasskeyRegisterCompleteWithoutChallenge(t *testing.T) {
	s, engine, _, user := newPasskeyTestServer(t)

	recorder := authenticatedRequest(s, engine, user, http.MethodPost, "/api/auth/passkeys/register/complete", map[string]any{
		"id":       "not-a-credential",
		"response": map[string]any{},
	})
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid completion, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestHandlePasskeyDeleteMissing(t *testing.T) {
	s, engine, _, user := newPasskeyTestServer(t)

	recorder := authenticatedRequest(s, engine, user, http.MethodDelete, "/api/auth/passkeys/999", nil)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing passkey, got %d", recorder.Code)
	}
}

func TestHandlePasskeyRename(t *testing.T) {
	s, engine, db, user := newPasskeyTestServer(t)

	pk := data.UserPasskey{
		UserID:     user.ID,
		Name:       "Old Name",
		Credential: `{"id":"dGVzdC1pZA","publicKey":"cA","attestationType":"none","attestationFormat":"none","transport":["internal"],"flags":{"userPresent":false,"userVerified":false,"backupEligible":false,"backupState":false},"authenticator":{"AAGUID":"AAAAAAAAAAAAAAAAAAAAAA","signCount":0,"cloneWarning":false,"attachment":"platform"},"attestation":{}}`,
	}
	if err := db.Create(&pk).Error; err != nil {
		t.Fatalf("failed to insert passkey: %v", err)
	}

	recorder := authenticatedRequest(s, engine, user, http.MethodPatch, "/api/auth/passkeys/"+strconv.FormatUint(uint64(pk.ID), 10), map[string]string{"name": "New Name"})
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var updated data.UserPasskey
	if err := db.First(&updated, pk.ID).Error; err != nil {
		t.Fatalf("failed to reload passkey: %v", err)
	}
	if updated.Name != "New Name" {
		t.Fatalf("expected name 'New Name', got %q", updated.Name)
	}

	// Empty name -> 400
	recorder2 := authenticatedRequest(s, engine, user, http.MethodPatch, "/api/auth/passkeys/"+strconv.FormatUint(uint64(pk.ID), 10), map[string]string{"name": ""})
	if recorder2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty name, got %d", recorder2.Code)
	}

	// Missing passkey -> 404
	recorder3 := authenticatedRequest(s, engine, user, http.MethodPatch, "/api/auth/passkeys/999", map[string]string{"name": "Any"})
	if recorder3.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing passkey, got %d", recorder3.Code)
	}
}
