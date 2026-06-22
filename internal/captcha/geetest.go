package captcha

import (
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

const geetestVerifyURL = "http://gcaptcha4.geetest.com/validate"

// GeetestService handles Geetest verification
type GeetestService struct {
	admin *admin.Service
}

// NewGeetestService creates a new Geetest service
func NewGeetestService(adminService *admin.Service) *GeetestService {
	return &GeetestService{
		admin: adminService,
	}
}

// GeetestVerifyResponse represents the response from Geetest verification API
type GeetestVerifyResponse struct {
	Result string `json:"result"`
	Reason string `json:"reason"`
	Status string `json:"status"`
}

// Verify validates a Geetest captcha
func (s *GeetestService) Verify(ctx context.Context, challenge, validate, seccode, captchaOutput string) (bool, error) {
	// Get Geetest settings
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get settings: %w", err)
	}

	captchaID := settings["captcha.geetest.captcha_id"]
	captchaKey := settings["captcha.geetest.captcha_key"]

	return s.VerifyWithConfig(ctx, captchaID, captchaKey, challenge, validate, seccode, captchaOutput)
}

// VerifyWithConfig validates a Geetest captcha using provided config
func (s *GeetestService) VerifyWithConfig(ctx context.Context, captchaID, captchaKey, challenge, validate, seccode, captchaOutput string) (bool, error) {
	captchaID = strings.TrimSpace(captchaID)
	captchaKey = strings.TrimSpace(captchaKey)

	if captchaID == "" || captchaKey == "" {
		return false, fmt.Errorf("geetest captcha_id and captcha_key not configured")
	}

	if challenge == "" || validate == "" || seccode == "" {
		return false, fmt.Errorf("geetest validation data incomplete")
	}

	// Generate sign_token according to Geetest v4 protocol
	signToken := generateGeetestSign(captchaKey, challenge)

	// Prepare form data (captcha_id goes in URL query per Geetest official docs)
	data := url.Values{}
	data.Set("lot_number", challenge)
	data.Set("captcha_output", captchaOutput)
	data.Set("pass_token", validate)
	data.Set("gen_time", seccode)
	data.Set("sign_token", signToken)

	verifyURL := geetestVerifyURL + "?captcha_id=" + url.QueryEscape(captchaID)
	req, err := http.NewRequestWithContext(ctx, "POST", verifyURL, strings.NewReader(data.Encode()))
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

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

	var verifyResp GeetestVerifyResponse
	if err := json.Unmarshal(body, &verifyResp); err != nil {
		return false, fmt.Errorf("failed to parse response: %w", err)
	}

	if verifyResp.Result != "success" || verifyResp.Status != "success" {
		return false, fmt.Errorf("geetest verification failed: %s", verifyResp.Reason)
	}

	return true, nil
}

// generateGeetestSign generates the sign_token for Geetest v4
// sign_token = hmac_sha256(lot_number, captcha_key)
func generateGeetestSign(captchaKey, lotNumber string) string {
	h := hmac.New(sha256.New, []byte(captchaKey))
	h.Write([]byte(lotNumber))
	return hex.EncodeToString(h.Sum(nil))
}

// GenerateGeetestSignature returns a deterministic hash for Geetest config
func GenerateGeetestSignature(captchaID, captchaKey string) string {
	captchaID = strings.TrimSpace(captchaID)
	captchaKey = strings.TrimSpace(captchaKey)
	if captchaID == "" || captchaKey == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(captchaID + "|" + captchaKey))
	return hex.EncodeToString(sum[:])
}
