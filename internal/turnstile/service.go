package turnstile

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"skyimage/internal/admin"
)

const verifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// Service handles Turnstile verification
type Service struct {
	admin *admin.Service
}

// New creates a new Turnstile service
func New(adminService *admin.Service) *Service {
	return &Service{
		admin: adminService,
	}
}

// VerifyResponse represents the response from Turnstile verification API
type VerifyResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts"`
	Hostname    string   `json:"hostname"`
	ErrorCodes  []string `json:"error-codes"`
	Action      string   `json:"action"`
	CData       string   `json:"cdata"`
}

// Verify validates a Turnstile token
func (s *Service) Verify(ctx context.Context, token string, remoteIP string) (bool, error) {
	// Get Turnstile settings
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get settings: %w", err)
	}

	// Check if Turnstile is enabled
	if settings["turnstile.enabled"] != "true" {
		// If not enabled, allow the request
		return true, nil
	}

	secretKey := settings["turnstile.secret_key"]
	return s.verifyWithSecret(ctx, token, remoteIP, secretKey)
}

// IsEnabled checks if Turnstile is enabled
func (s *Service) IsEnabled(ctx context.Context) (bool, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, err
	}
	return settings["turnstile.enabled"] == "true", nil
}

// GetSiteKey returns the Turnstile site key
func (s *Service) GetSiteKey(ctx context.Context) (string, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return "", err
	}
	return settings["turnstile.site_key"], nil
}

// VerifyWithSecret validates a Turnstile token using a provided secret key (without requiring persisted settings).
func (s *Service) VerifyWithSecret(ctx context.Context, token string, remoteIP string, secretKey string) (bool, error) {
	return s.verifyWithSecret(ctx, token, remoteIP, secretKey)
}

func (s *Service) verifyWithSecret(ctx context.Context, token string, remoteIP string, secretKey string) (bool, error) {
	secretKey = strings.TrimSpace(secretKey)
	if secretKey == "" {
		return false, fmt.Errorf("turnstile secret key not configured")
	}

	payload := map[string]string{
		"secret":   secretKey,
		"response": token,
	}
	if remoteIP != "" {
		payload["remoteip"] = remoteIP
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return false, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", verifyURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return false, fmt.Errorf("failed to read response: %w", err)
	}

	var verifyResp VerifyResponse
	if err := json.Unmarshal(body, &verifyResp); err != nil {
		return false, fmt.Errorf("failed to parse response: %w", err)
	}
	if !verifyResp.Success {
		return false, fmt.Errorf("verification failed: %v", verifyResp.ErrorCodes)
	}
	return true, nil
}

// GenerateSignature returns a deterministic hash used to remember which site/secret key combo was verified.
func GenerateSignature(siteKey, secretKey string) string {
	siteKey = strings.TrimSpace(siteKey)
	secretKey = strings.TrimSpace(secretKey)
	if siteKey == "" || secretKey == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(siteKey + "|" + secretKey))
	return hex.EncodeToString(sum[:])
}
