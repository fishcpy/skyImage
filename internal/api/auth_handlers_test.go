package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/admin"
	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/session"
	"skyimage/internal/users"
	"skyimage/internal/verification"
)

func newAuthTestServer(t *testing.T) (*Server, *gorm.DB) {
	t.Helper()

	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	if err := db.AutoMigrate(&data.User{}, &data.Group{}, &data.ConfigEntry{}, &data.SessionEntry{}); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	return &Server{
		db:           db,
		cfg:          config.Config{AllowRegistration: true},
		admin:        admin.New(db),
		users:        users.New(db),
		verification: verification.New(),
		authLimiter:  newRequestLimiter(),
		session:      session.NewManager(db, 24*time.Hour),
	}, db
}

func setConfig(t *testing.T, db *gorm.DB, key, value string) {
	t.Helper()
	if err := db.Create(&data.ConfigEntry{Key: key, Value: value}).Error; err != nil {
		t.Fatalf("failed to insert config %s: %v", key, err)
	}
}

func createAuthTestUser(t *testing.T, db *gorm.DB, email string) {
	t.Helper()
	user := data.User{
		Name:         "Existing User",
		Email:        email,
		PasswordHash: "hashed",
		Status:       1,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
}

func performJSONRequest(t *testing.T, handler func(*gin.Context), payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("failed to marshal payload: %v", err)
	}

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Request.RemoteAddr = "127.0.0.1:12345"

	handler(ctx)
	return recorder
}

func TestHandleSendVerificationCode_DoesNotEnumerateExistingEmail(t *testing.T) {
	server, db := newAuthTestServer(t)
	setConfig(t, db, "mail.register.verify", "true")
	createAuthTestUser(t, db, "existing@example.com")

	recorder := performJSONRequest(t, server.handleSendVerificationCode, map[string]string{
		"email": "existing@example.com",
	})

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	body := recorder.Body.String()
	if strings.Contains(body, "已被注册") {
		t.Fatalf("response leaked registration status: %s", body)
	}
	if !strings.Contains(body, registrationVerificationMessage) {
		t.Fatalf("expected generic verification success message, got %s", body)
	}
}

func TestHandleRegister_HidesDuplicateEmailDetails(t *testing.T) {
	server, db := newAuthTestServer(t)
	createAuthTestUser(t, db, "existing@example.com")

	recorder := performJSONRequest(t, server.handleRegister, map[string]string{
		"name":     "Another User",
		"email":    "existing@example.com",
		"password": "Password1",
	})

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
	body := strings.ToLower(recorder.Body.String())
	if strings.Contains(body, "unique") || strings.Contains(body, "constraint") || strings.Contains(body, "duplicated") {
		t.Fatalf("response leaked database details: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "注册失败，请检查输入信息") {
		t.Fatalf("expected generic registration failure message, got %s", recorder.Body.String())
	}
}
