package captcha

import (
	"context"
	"fmt"

	"skyimage/internal/admin"
)

// Provider represents a captcha verification provider
type Provider string

const (
	ProviderCloudflare Provider = "cloudflare"
	ProviderGeetest    Provider = "geetest"
)

// Service handles unified captcha verification
type Service struct {
	admin      *admin.Service
	cloudflare *CloudflareService
	geetest    *GeetestService
}

// New creates a new unified captcha service
func New(adminService *admin.Service) *Service {
	return &Service{
		admin:      adminService,
		cloudflare: NewCloudflareService(adminService),
		geetest:    NewGeetestService(adminService),
	}
}

// Config represents the captcha configuration
type Config struct {
	Enabled  bool     `json:"enabled"`
	Provider Provider `json:"provider"`
	SiteKey  string   `json:"siteKey,omitempty"`
}

// GetConfig returns the current captcha configuration for a specific context
func (s *Service) GetConfig(ctx context.Context, context string) (Config, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return Config{}, err
	}

	// Check if captcha is globally enabled
	if settings["captcha.enabled"] != "true" {
		return Config{Enabled: false}, nil
	}

	// Check if context-specific captcha is enabled
	// Map context names to config keys
	var contextKey string
	switch context {
	case "login":
		contextKey = "captcha.login"
	case "register":
		contextKey = "captcha.register"
	case "register_verify":
		contextKey = "captcha.register_verify"
	case "forgot_password_request":
		contextKey = "captcha.forgot_password_request"
	case "forgot_password_reset":
		contextKey = "captcha.forgot_password_reset"
	default:
		return Config{Enabled: false}, fmt.Errorf("unknown context: %s", context)
	}

	if settings[contextKey] != "true" {
		return Config{Enabled: false}, nil
	}

	// Get the active provider
	provider := Provider(settings["captcha.provider"])
	if provider == "" {
		return Config{Enabled: false}, nil
	}

	var siteKey string
	switch provider {
	case ProviderCloudflare:
		siteKey = settings["captcha.cloudflare.site_key"]
	case ProviderGeetest:
		siteKey = settings["captcha.geetest.captcha_id"]
	default:
		return Config{Enabled: false}, fmt.Errorf("unknown provider: %s", provider)
	}

	if siteKey == "" {
		return Config{Enabled: false}, nil
	}

	return Config{
		Enabled:  true,
		Provider: provider,
		SiteKey:  siteKey,
	}, nil
}

// Verify validates a captcha token with the active provider
func (s *Service) Verify(ctx context.Context, provider Provider, token string, remoteIP string, extraData map[string]string) (bool, error) {
	// Check if captcha is enabled
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get settings: %w", err)
	}

	if settings["captcha.enabled"] != "true" {
		return true, nil // If not enabled, allow the request
	}

	// Get the configured provider
	configuredProvider := Provider(settings["captcha.provider"])
	if configuredProvider == "" || provider != configuredProvider {
		return false, fmt.Errorf("provider mismatch or not configured")
	}

	switch provider {
	case ProviderCloudflare:
		return s.cloudflare.Verify(ctx, token, remoteIP)
	case ProviderGeetest:
		if extraData == nil {
			return false, fmt.Errorf("geetest requires extra validation data")
		}
		challenge := extraData["challenge"]
		validate := extraData["validate"]
		seccode := extraData["seccode"]
		captchaOutput := extraData["captcha_output"]
		return s.geetest.Verify(ctx, challenge, validate, seccode, captchaOutput)
	default:
		return false, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// TestConfig tests the captcha configuration with actual verification
func (s *Service) TestConfig(ctx context.Context, provider Provider, config map[string]string, token string, extraData map[string]string) (bool, error) {
	switch provider {
	case ProviderCloudflare:
		secretKey := config["secret_key"]
		if secretKey == "" {
			return false, fmt.Errorf("cloudflare secret key is required")
		}
		return s.cloudflare.VerifyWithSecret(ctx, token, "", secretKey)
	case ProviderGeetest:
		captchaID := config["captcha_id"]
		captchaKey := config["captcha_key"]
		if captchaID == "" || captchaKey == "" {
			return false, fmt.Errorf("geetest captcha_id and captcha_key are required")
		}
		if extraData == nil {
			return false, fmt.Errorf("geetest requires validation data")
		}
		challenge := extraData["challenge"]
		validate := extraData["validate"]
		seccode := extraData["seccode"]
		captchaOutput := extraData["captcha_output"]
		return s.geetest.VerifyWithConfig(ctx, captchaID, captchaKey, challenge, validate, seccode, captchaOutput)
	default:
		return false, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// IsEnabled checks if captcha is globally enabled
func (s *Service) IsEnabled(ctx context.Context) (bool, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, err
	}
	return settings["captcha.enabled"] == "true", nil
}

// GetActiveProvider returns the currently active provider
func (s *Service) GetActiveProvider(ctx context.Context) (Provider, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return "", err
	}
	if settings["captcha.enabled"] != "true" {
		return "", nil
	}
	return Provider(settings["captcha.provider"]), nil
}
