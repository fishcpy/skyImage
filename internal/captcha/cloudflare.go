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
	"strings"
	"time"

	"skyimage/internal/admin"
)

const cloudflareVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// CloudflareService handles Cloudflare Turnstile verification
type CloudflareService struct {
	admin *admin.Service
}

// NewCloudflareService creates a new Cloudflare Turnstile service
func NewCloudflareService(adminService *admin.Service) *CloudflareService {
	return &CloudflareService{
		admin: adminService,
	}
}

// VerifyResponse represents the response from Cloudflare Turnstile verification API
type VerifyResponse struct {
	Success     bool     `json:"success"`
	ChallengeTS string   `json:"challenge_ts"`
	Hostname    string   `json:"hostname"`
	ErrorCodes  []string `json:"error-codes"`
	Action      string   `json:"action"`
	CData       string   `json:"cdata"`
}

// Verify validates a Cloudflare Turnstile token
func (s *CloudflareService) Verify(ctx context.Context, token string, remoteIP string) (bool, error) {
	// Get Cloudflare settings
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get settings: %w", err)
	}

	secretKey := settings["captcha.cloudflare.secret_key"]
	return s.VerifyWithSecret(ctx, token, remoteIP, secretKey)
}

// VerifyWithSecret validates a Cloudflare Turnstile token using a provided secret key
func (s *CloudflareService) VerifyWithSecret(ctx context.Context, token string, remoteIP string, secretKey string) (bool, error) {
	secretKey = strings.TrimSpace(secretKey)
	if secretKey == "" {
		return false, fmt.Errorf("cloudflare secret key not configured")
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

	req, err := http.NewRequestWithContext(ctx, "POST", cloudflareVerifyURL, bytes.NewBuffer(jsonData))
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

// GenerateSignature returns a deterministic hash for Cloudflare config
func GenerateSignature(siteKey, secretKey string) string {
	siteKey = strings.TrimSpace(siteKey)
	secretKey = strings.TrimSpace(secretKey)
	if siteKey == "" || secretKey == "" {
		return ""
	}
	h := hmac.New(sha256.New, []byte(siteKey))
	h.Write([]byte(secretKey))
	return hex.EncodeToString(h.Sum(nil))
}
