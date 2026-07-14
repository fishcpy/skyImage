package captcha

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"skyimage/internal/admin"
)

// CapService handles Cap Standalone siteverify
type CapService struct {
	admin *admin.Service
}

// NewCapService creates a new Cap service
func NewCapService(adminService *admin.Service) *CapService {
	return &CapService{admin: adminService}
}

// CapVerifyResponse represents Cap siteverify API response
type CapVerifyResponse struct {
	Success bool `json:"success"`
}

// NormalizeCapInstanceURL trims trailing slashes and validates the instance URL
func NormalizeCapInstanceURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("cap instance url is required")
	}
	raw = strings.TrimRight(raw, "/")
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid cap instance url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("cap instance url must use http or https")
	}
	if u.Host == "" {
		return "", fmt.Errorf("cap instance url host is required")
	}
	return raw, nil
}

// BuildCapAPIEndpoint returns the widget API endpoint: {instance}/{siteKey}/
func BuildCapAPIEndpoint(instanceURL, siteKey string) (string, error) {
	base, err := NormalizeCapInstanceURL(instanceURL)
	if err != nil {
		return "", err
	}
	siteKey = strings.TrimSpace(siteKey)
	if siteKey == "" {
		return "", fmt.Errorf("cap site key is required")
	}
	return fmt.Sprintf("%s/%s/", base, siteKey), nil
}

// BuildCapSiteverifyURL returns the siteverify URL
func BuildCapSiteverifyURL(instanceURL, siteKey string) (string, error) {
	endpoint, err := BuildCapAPIEndpoint(instanceURL, siteKey)
	if err != nil {
		return "", err
	}
	return endpoint + "siteverify", nil
}

// Verify validates a Cap token using stored settings
func (s *CapService) Verify(ctx context.Context, token string) (bool, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get settings: %w", err)
	}
	return s.VerifyWithConfig(
		ctx,
		settings["captcha.cap.instance_url"],
		settings["captcha.cap.site_key"],
		settings["captcha.cap.secret_key"],
		token,
	)
}

// VerifyWithConfig validates a Cap token with explicit config
func (s *CapService) VerifyWithConfig(ctx context.Context, instanceURL, siteKey, secretKey, token string) (bool, error) {
	secretKey = strings.TrimSpace(secretKey)
	token = strings.TrimSpace(token)
	if secretKey == "" {
		return false, fmt.Errorf("cap secret key not configured")
	}
	if token == "" {
		return false, fmt.Errorf("cap token is required")
	}

	verifyURL, err := BuildCapSiteverifyURL(instanceURL, siteKey)
	if err != nil {
		return false, err
	}

	payload := map[string]string{
		"secret":   secretKey,
		"response": token,
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

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := strings.TrimSpace(string(body))
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		return false, fmt.Errorf("cap siteverify http %d: %s", resp.StatusCode, snippet)
	}

	var verifyResp CapVerifyResponse
	if err := json.Unmarshal(body, &verifyResp); err != nil {
		return false, fmt.Errorf("failed to parse response: %w", err)
	}
	if !verifyResp.Success {
		return false, fmt.Errorf("cap verification failed")
	}
	return true, nil
}

// GenerateCapSignature returns a deterministic hash for Cap config
func GenerateCapSignature(instanceURL, siteKey, secretKey string) string {
	instanceURL = strings.TrimSpace(instanceURL)
	siteKey = strings.TrimSpace(siteKey)
	secretKey = strings.TrimSpace(secretKey)
	if instanceURL == "" || siteKey == "" || secretKey == "" {
		return ""
	}
	normalized, err := NormalizeCapInstanceURL(instanceURL)
	if err != nil {
		return ""
	}
	h := hmac.New(sha256.New, []byte(normalized+"|"+siteKey))
	h.Write([]byte(secretKey))
	return hex.EncodeToString(h.Sum(nil))
}
