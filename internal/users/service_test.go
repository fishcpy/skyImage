package users

import (
	"context"
	"encoding/json"
	"testing"

	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	if err := db.AutoMigrate(&data.User{}, &data.Group{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	return db
}

func TestUpdateProfile_BothVisibilityAndTheme(t *testing.T) {
	db := setupTestDB(t)
	service := New(db, "test-secret")

	// Create a test user
	user := data.User{
		Name:         "Test User",
		Email:        "test@example.com",
		PasswordHash: "hashed",
		Status:       1,
		Configs:      datatypes.JSON([]byte(`{}`)),
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Update profile with both visibility and theme
	input := ProfileUpdateInput{
		Name:              "Test User",
		URL:               "https://example.com",
		DefaultVisibility: "public",
		ThemePreference:   "dark",
	}

	updated, err := service.UpdateProfile(context.Background(), user.ID, input)
	if err != nil {
		t.Fatalf("UpdateProfile failed: %v", err)
	}

	// Parse the configs
	var cfg map[string]interface{}
	if err := json.Unmarshal(updated.Configs, &cfg); err != nil {
		t.Fatalf("failed to parse configs: %v", err)
	}

	// Verify both settings are saved
	if visibility, ok := cfg["default_visibility"].(string); !ok || visibility != "public" {
		t.Errorf("expected default_visibility to be 'public', got %v", cfg["default_visibility"])
	}

	if theme, ok := cfg["theme_preference"].(string); !ok || theme != "dark" {
		t.Errorf("expected theme_preference to be 'dark', got %v", cfg["theme_preference"])
	}
}

func TestUpdateProfile_OnlyVisibility(t *testing.T) {
	db := setupTestDB(t)
	service := New(db, "test-secret")

	// Create a test user with existing theme preference
	existingConfigs := map[string]interface{}{
		"theme_preference": "light",
	}
	configBytes, _ := json.Marshal(existingConfigs)

	user := data.User{
		Name:         "Test User",
		Email:        "test@example.com",
		PasswordHash: "hashed",
		Status:       1,
		Configs:      datatypes.JSON(configBytes),
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Update only visibility
	input := ProfileUpdateInput{
		Name:              "Test User",
		URL:               "",
		DefaultVisibility: "private",
		ThemePreference:   "", // Not updating theme
	}

	updated, err := service.UpdateProfile(context.Background(), user.ID, input)
	if err != nil {
		t.Fatalf("UpdateProfile failed: %v", err)
	}

	// Parse the configs
	var cfg map[string]interface{}
	if err := json.Unmarshal(updated.Configs, &cfg); err != nil {
		t.Fatalf("failed to parse configs: %v", err)
	}

	// Verify visibility is updated
	if visibility, ok := cfg["default_visibility"].(string); !ok || visibility != "private" {
		t.Errorf("expected default_visibility to be 'private', got %v", cfg["default_visibility"])
	}

	// Verify theme is preserved
	if theme, ok := cfg["theme_preference"].(string); !ok || theme != "light" {
		t.Errorf("expected theme_preference to be preserved as 'light', got %v", cfg["theme_preference"])
	}
}
