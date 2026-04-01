package admin

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

func setupAdminTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	if err := db.AutoMigrate(&data.AuditProfile{}, &data.Strategy{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
	return db
}

func TestDeleteAuditProfile_BlockedWhenStrategyReferencesIt(t *testing.T) {
	db := setupAdminTestDB(t)
	service := New(db)

	profile := data.AuditProfile{
		Name:     "审核一号",
		Provider: AuditProviderUAPINSFW,
		Configs:  datatypes.JSON([]byte(`{"max_concurrency":1}`)),
	}
	if err := db.Create(&profile).Error; err != nil {
		t.Fatalf("failed to create profile: %v", err)
	}

	cfgBytes, _ := json.Marshal(map[string]interface{}{
		"driver":                 "local",
		"image_audit_profile_id": profile.ID,
	})
	strategy := data.Strategy{
		Name:    "本地策略",
		Configs: datatypes.JSON(cfgBytes),
	}
	if err := db.Create(&strategy).Error; err != nil {
		t.Fatalf("failed to create strategy: %v", err)
	}

	err := service.DeleteAuditProfile(context.Background(), profile.ID)
	if err == nil {
		t.Fatal("expected delete to fail when audit profile is still referenced")
	}
	if !errors.Is(err, ErrAuditProfileInUse) {
		t.Fatalf("expected ErrAuditProfileInUse, got %v", err)
	}
	if !strings.Contains(err.Error(), strategy.Name) {
		t.Fatalf("expected error to mention strategy name, got %q", err.Error())
	}
}

func TestCreateAuditProfile_NormalizesConfigs(t *testing.T) {
	db := setupAdminTestDB(t)
	service := New(db)

	profile, err := service.CreateAuditProfile(context.Background(), AuditProfilePayload{
		Name:     "免费审核",
		Provider: AuditProviderUAPINSFW,
		Configs: map[string]interface{}{
			"api_key":         "",
			"max_concurrency": 0,
		},
	})
	if err != nil {
		t.Fatalf("CreateAuditProfile failed: %v", err)
	}

	var configs map[string]interface{}
	if err := json.Unmarshal(profile.Configs, &configs); err != nil {
		t.Fatalf("failed to decode configs: %v", err)
	}
	if got := int(configs["max_concurrency"].(float64)); got != 1 {
		t.Fatalf("expected max_concurrency to default to 1, got %d", got)
	}
}
