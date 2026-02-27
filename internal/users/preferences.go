package users

import (
	"encoding/json"
	"strconv"
	"strings"

	"gorm.io/datatypes"

	"skyimage/internal/data"
)

const (
	defaultVisibilityKey = "default_visibility"
	defaultStrategyKey   = "default_strategy"
	themePreferenceKey   = "theme_preference"
)

// NormalizeVisibility coerces arbitrary user input into supported visibility values.
func NormalizeVisibility(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "public":
		return "public"
	default:
		return "private"
	}
}

// DefaultVisibility returns the stored default visibility for uploads.
func DefaultVisibility(user data.User) string {
	if len(user.Configs) == 0 {
		return "private"
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(user.Configs, &cfg); err != nil {
		return "private"
	}
	if val, ok := cfg[defaultVisibilityKey].(string); ok {
		return NormalizeVisibility(val)
	}
	return "private"
}

// UpdateDefaultVisibility rewrites the configs JSON with the provided preference.
func UpdateDefaultVisibility(existing datatypes.JSON, visibility string) datatypes.JSON {
	cfg := map[string]interface{}{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &cfg)
	}
	if visibility == "" {
		delete(cfg, defaultVisibilityKey)
	} else {
		cfg[defaultVisibilityKey] = NormalizeVisibility(visibility)
	}
	bytes, _ := json.Marshal(cfg)
	return datatypes.JSON(bytes)
}

// DefaultStrategyID returns the preferred strategy id stored on the user profile.
func DefaultStrategyID(user data.User) *uint {
	if len(user.Configs) == 0 {
		return nil
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(user.Configs, &cfg); err != nil {
		return nil
	}
	if val, ok := cfg[defaultStrategyKey]; ok {
		switch value := val.(type) {
		case float64:
			id := uint(value)
			if id > 0 {
				return &id
			}
		case int:
			id := uint(value)
			if id > 0 {
				return &id
			}
		case string:
			// attempt to parse numeric string
			if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
				id := uint(parsed)
				return &id
			}
		}
	}
	return nil
}

// UpdateDefaultStrategy writes preferred strategy id.
func UpdateDefaultStrategy(existing datatypes.JSON, strategyID uint) datatypes.JSON {
	cfg := map[string]interface{}{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &cfg)
	}
	if strategyID == 0 {
		delete(cfg, defaultStrategyKey)
	} else {
		cfg[defaultStrategyKey] = strategyID
	}
	bytes, _ := json.Marshal(cfg)
	return datatypes.JSON(bytes)
}

func ThemePreference(user data.User) string {
	if len(user.Configs) == 0 {
		return "system"
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(user.Configs, &cfg); err != nil {
		return "system"
	}
	if val, ok := cfg[themePreferenceKey].(string); ok && val != "" {
		return val
	}
	return "system"
}

func UpdateThemePreference(existing datatypes.JSON, theme string) datatypes.JSON {
	theme = strings.ToLower(strings.TrimSpace(theme))
	if theme != "light" && theme != "dark" {
		theme = "system"
	}
	cfg := map[string]interface{}{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &cfg)
	}
	cfg[themePreferenceKey] = theme
	bytes, _ := json.Marshal(cfg)
	return datatypes.JSON(bytes)
}
