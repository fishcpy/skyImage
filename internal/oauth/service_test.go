package oauth

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

type mapSettings map[string]string

func (m mapSettings) GetSettings(ctx context.Context) (map[string]string, error) {
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out, nil
}

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:" + t.Name() + "?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&data.User{}, &data.UserOAuthBinding{}, &data.OAuthState{}, &data.Group{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestNormalizeRegistrationMode(t *testing.T) {
	if got := NormalizeRegistrationMode("oauth_only", true); got != RegModeOAuthOnly {
		t.Fatalf("got %s", got)
	}
	if got := NormalizeRegistrationMode("", false); got != RegModeClosed {
		t.Fatalf("legacy false -> closed, got %s", got)
	}
	if got := NormalizeRegistrationMode("", true); got != RegModeOpen {
		t.Fatalf("legacy true -> open, got %s", got)
	}
}

func TestStateCreateConsumeAndPKCE(t *testing.T) {
	db := testDB(t)
	svc := New(db, mapSettings{"oauth.enabled": "true"})

	state, verifier, err := svc.CreateState(context.Background(), "github", ModeLogin, 0)
	if err != nil {
		t.Fatal(err)
	}
	if state == "" || verifier == "" {
		t.Fatal("expected state and verifier")
	}
	if len(codeChallengeS256(verifier)) < 40 {
		t.Fatal("challenge too short")
	}

	pending, err := svc.ConsumeState(context.Background(), state)
	if err != nil {
		t.Fatal(err)
	}
	if pending.Provider != "github" || pending.CodeVerifier != verifier {
		t.Fatalf("unexpected pending: %+v", pending)
	}
	// one-time
	if _, err := svc.ConsumeState(context.Background(), state); err == nil {
		t.Fatal("expected invalid state on second consume")
	}
}

func TestStateExpired(t *testing.T) {
	db := testDB(t)
	svc := New(db, mapSettings{})
	entry := data.OAuthState{
		ID:        "expired-state",
		Provider:  "github",
		Mode:      ModeLogin,
		ExpiresAt: time.Now().Add(-time.Minute),
	}
	if err := db.Create(&entry).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ConsumeState(context.Background(), "expired-state"); err == nil {
		t.Fatal("expected expired state rejected")
	}
}

func TestAutoLinkByEmailDefaultOff(t *testing.T) {
	db := testDB(t)
	svc := New(db, mapSettings{"oauth.enabled": "true"})
	group := data.Group{Name: "default", IsDefault: true}
	if err := db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	existing := data.User{
		Name:         "old",
		Email:        "same@example.com",
		PasswordHash: "x",
		Status:       1,
		GroupID:      &group.ID,
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatal(err)
	}

	// auto-link off: should create a different user (synthetic email collision handled)
	user, err := svc.CompleteLogin(context.Background(), ExternalIdentity{
		Provider:       "github",
		ProviderUserID: "42",
		Email:          "same@example.com",
		Name:           "new",
	}, "1.2.3.4")
	if err != nil {
		t.Fatal(err)
	}
	if user.ID == existing.ID {
		t.Fatal("auto-link should be off by default")
	}
}

func TestAutoLinkByEmailWhenEnabled(t *testing.T) {
	db := testDB(t)
	svc := New(db, mapSettings{
		"oauth.enabled":            "true",
		"oauth.auto_link_by_email": "true",
	})
	group := data.Group{Name: "default", IsDefault: true}
	if err := db.Create(&group).Error; err != nil {
		t.Fatal(err)
	}
	existing := data.User{
		Name:         "old",
		Email:        "same@example.com",
		PasswordHash: "x",
		Status:       1,
		GroupID:      &group.ID,
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatal(err)
	}

	user, err := svc.CompleteLogin(context.Background(), ExternalIdentity{
		Provider:       "github",
		ProviderUserID: "99",
		Email:          "same@example.com",
		Name:           "new",
	}, "1.2.3.4")
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != existing.ID {
		t.Fatalf("expected auto-link to existing user, got %d vs %d", user.ID, existing.ID)
	}
	var n int64
	db.Model(&data.UserOAuthBinding{}).Where("user_id = ? AND provider = ?", existing.ID, "github").Count(&n)
	if n != 1 {
		t.Fatalf("expected binding, got %d", n)
	}
}

func TestEmailLooksValid(t *testing.T) {
	if emailLooksValid("not-an-email") {
		t.Fatal("expected invalid")
	}
	if !emailLooksValid("a@b.co") {
		t.Fatal("expected valid")
	}
}

func TestIsProviderReadyCustomRequiresURLs(t *testing.T) {
	cfg := ProviderConfig{
		ID: "custom", Enabled: true,
		ClientID: "id", ClientSecret: "sec",
		AuthURL: "https://idp.example.com/auth",
	}
	if isProviderReady(cfg) {
		t.Fatal("token/userinfo missing should fail")
	}
}
