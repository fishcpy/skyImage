package passkey

import (
	"context"
	"encoding/json"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/data"
	"skyimage/internal/users"
)

var dbSeq int64

type stubSettings struct {
	values map[string]string
}

func (s *stubSettings) GetSettings(ctx context.Context) (map[string]string, error) {
	if s.values == nil {
		return map[string]string{}, nil
	}
	return s.values, nil
}

func newTestService(t *testing.T, settings *stubSettings) (*Service, *gorm.DB, data.User) {
	t.Helper()

	n := atomic.AddInt64(&dbSeq, 1)
	db, err := gorm.Open(sqlite.Open("file:passkey-test-"+t.Name()+"-"+strconv.FormatInt(n, 10)+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	if err := db.AutoMigrate(&data.User{}, &data.Group{}, &data.UserPasskey{}, &data.PasskeyChallenge{}); err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	svc := New(db, settings, "http://localhost:8080")

	user := data.User{
		Name:         "Passkey User",
		Email:        "passkey@example.com",
		PasswordHash: "x",
		Status:       1,
	}
	if err := users.CreateUserWithGeneratedID(db, &user); err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	return svc, db, user
}

func TestEnabled(t *testing.T) {
	ctx := context.Background()

	svc, _, _ := newTestService(t, &stubSettings{values: map[string]string{}})
	if !svc.Enabled(ctx) {
		t.Fatalf("expected passkeys enabled by default")
	}

	svc, _, _ = newTestService(t, &stubSettings{values: map[string]string{ConfigKeyEnabled: "false"}})
	if svc.Enabled(ctx) {
		t.Fatalf("expected passkeys disabled when config key is false")
	}

	svc, _, _ = newTestService(t, &stubSettings{values: map[string]string{ConfigKeyEnabled: "true"}})
	if !svc.Enabled(ctx) {
		t.Fatalf("expected passkeys enabled when config key is true")
	}
}

func TestBeginRegistration(t *testing.T) {
	ctx := context.Background()
	svc, _, user := newTestService(t, &stubSettings{})

	options, err := svc.BeginRegistration(ctx, user.ID, "http://localhost:8080", "SkyImage")
	if err != nil {
		t.Fatalf("begin registration failed: %v", err)
	}
	if options.Response.Challenge.String() == "" {
		t.Fatalf("expected a challenge in options")
	}
	// The ceremony session must be persisted.
	var count int64
	if err := svc.db.Model(&data.PasskeyChallenge{}).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
		t.Fatalf("query challenge failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 stored challenge, got %d", count)
	}
}

func TestBeginLogin(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t, &stubSettings{})

	assertion, err := svc.BeginLogin(ctx, "http://localhost:8080", "SkyImage")
	if err != nil {
		t.Fatalf("begin login failed: %v", err)
	}
	if assertion.Response.Challenge.String() == "" {
		t.Fatalf("expected a challenge in assertion options")
	}
}

func TestFinishRegistrationInvalidResponse(t *testing.T) {
	ctx := context.Background()
	svc, _, user := newTestService(t, &stubSettings{})

	if _, err := svc.BeginRegistration(ctx, user.ID, "http://localhost:8080", "SkyImage"); err != nil {
		t.Fatalf("begin registration failed: %v", err)
	}

	// Garbage / malformed payload must be rejected.
	if _, err := svc.FinishRegistration(ctx, user.ID, "http://localhost:8080", "SkyImage", []byte(`{"id":123`)); err == nil {
		t.Fatalf("expected an error for malformed completion payload")
	}

	// A forged response referencing a challenge we never issued must be rejected.
	forged := []byte(`{"id":"AAAA","type":"public-key","rawId":"AAAA","response":{"clientDataJSON":"e30=","attestationObject":"AAAA","transports":[]}}`)
	if _, err := svc.FinishRegistration(ctx, user.ID, "http://localhost:8080", "SkyImage", forged); err == nil {
		t.Fatalf("expected an error for unverified completion payload")
	}
}

func TestListAndDelete(t *testing.T) {
	ctx := context.Background()
	svc, db, user := newTestService(t, &stubSettings{})

	// Insert a fake stored credential directly (real credentials come from a
	// successful ceremony, which requires a live authenticator).
	cred := webauthn.Credential{
		ID:              []byte("cred-id-123"),
		PublicKey:       []byte{0x30, 0x82},
		AttestationType: "none",
		AttestationFormat: "none",
		Transport:       []protocol.AuthenticatorTransport{"internal"},
		Flags: webauthn.CredentialFlags{
			UserPresent:    true,
			UserVerified:   true,
			BackupEligible: true,
			BackupState:    true,
		},
		Authenticator: webauthn.Authenticator{
			AAGUID:       make([]byte, 16),
			SignCount:    1,
			CloneWarning: false,
			Attachment:   protocol.AuthenticatorAttachment("platform"),
		},
		Attestation: webauthn.CredentialAttestation{},
	}
	credJSON, err := json.Marshal(cred)
	if err != nil {
		t.Fatalf("failed to marshal credential: %v", err)
	}
	raw := data.UserPasskey{
		UserID:     user.ID,
		Name:       "Test Key",
		Credential: string(credJSON),
	}
	if err := db.Create(&raw).Error; err != nil {
		t.Fatalf("failed to insert passkey: %v", err)
	}

	items, err := svc.List(ctx, user.ID)
	if err != nil {
		t.Fatalf("list failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 passkey, got %d", len(items))
	}

	dto, err := svc.ToDTO(items[0])
	if err != nil {
		t.Fatalf("toDTO failed: %v", err)
	}
	if dto.Name != "Test Key" || dto.CredentialID != "Y3JlZC1pZC0xMjM" {
		t.Fatalf("unexpected dto: %+v", dto)
	}

	if err := svc.Delete(ctx, user.ID, items[0].ID); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if err := svc.Delete(ctx, user.ID, items[0].ID); err == nil {
		t.Fatalf("expected error deleting a missing passkey")
	}
}

func TestChallengeSingleUse(t *testing.T) {
	ctx := context.Background()
	svc, db, user := newTestService(t, &stubSettings{})

	if _, err := svc.BeginRegistration(ctx, user.ID, "http://localhost:8080", "SkyImage"); err != nil {
		t.Fatalf("begin registration failed: %v", err)
	}
	var challenge data.PasskeyChallenge
	if err := db.First(&challenge).Error; err != nil {
		t.Fatalf("failed to load challenge: %v", err)
	}

	// Expire it and make sure consumption is refused.
	if err := db.Model(&challenge).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatalf("failed to expire challenge: %v", err)
	}
	if _, err := svc.consumeChallenge(ctx, challenge.ID, ActionRegister, user.ID); err != ErrInvalidSession {
		t.Fatalf("expected ErrInvalidSession for expired challenge, got %v", err)
	}
}
