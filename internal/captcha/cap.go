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
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"skyimage/internal/admin"
)

// capSiteKeyPattern restricts site keys to a safe path segment alphabet.
var capSiteKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

// capInstanceURLPattern is a barrier for request-forgery analysis: only absolute
// http(s) URLs with a hostname and no userinfo/query/fragment are accepted.
var capInstanceURLPattern = regexp.MustCompile(`^https?://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?(?:/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$`)

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

// NormalizeCapInstanceURL trims trailing slashes and validates the instance URL.
// Rejects private/loopback/link-local hosts to reduce SSRF risk.
func NormalizeCapInstanceURL(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("cap instance url is required")
	}
	raw = strings.TrimRight(raw, "/")
	if !capInstanceURLPattern.MatchString(raw) {
		return "", fmt.Errorf("invalid cap instance url format")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid cap instance url: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("cap instance url must use http or https")
	}
	if u.Host == "" || u.User != nil {
		return "", fmt.Errorf("cap instance url host is required")
	}
	if u.RawQuery != "" || u.Fragment != "" {
		return "", fmt.Errorf("cap instance url must not include query or fragment")
	}
	if err := validateCapHost(u.Hostname()); err != nil {
		return "", err
	}
	return raw, nil
}

func validateCapHost(host string) error {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "" {
		return fmt.Errorf("cap instance url host is required")
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return fmt.Errorf("cap instance url must not target localhost")
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return fmt.Errorf("cap instance url must not target private or loopback addresses")
		}
		return nil
	}
	// Block obvious metadata hostnames.
	if host == "metadata.google.internal" || host == "metadata" {
		return fmt.Errorf("cap instance url host is not allowed")
	}
	return nil
}

// BuildCapAPIEndpoint returns the widget API endpoint: {instance}/{siteKey}/
func BuildCapAPIEndpoint(instanceURL, siteKey string) (string, error) {
	base, err := NormalizeCapInstanceURL(instanceURL)
	if err != nil {
		return "", err
	}
	siteKey = strings.TrimSpace(siteKey)
	if !capSiteKeyPattern.MatchString(siteKey) {
		return "", fmt.Errorf("cap site key is invalid")
	}
	// Rebuild from validated components so untrusted input cannot control host.
	u, err := url.Parse(base)
	if err != nil {
		return "", fmt.Errorf("invalid cap instance url: %w", err)
	}
	basePath := strings.TrimRight(u.Path, "/")
	u.Path = basePath + "/" + siteKey + "/"
	u.RawQuery = ""
	u.Fragment = ""
	u.User = nil
	return u.String(), nil
}

// BuildCapSiteverifyURL returns the siteverify URL
func BuildCapSiteverifyURL(instanceURL, siteKey string) (string, error) {
	endpoint, err := BuildCapAPIEndpoint(instanceURL, siteKey)
	if err != nil {
		return "", err
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", fmt.Errorf("invalid cap siteverify url: %w", err)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/siteverify"
	u.RawQuery = ""
	u.Fragment = ""
	u.User = nil
	out := u.String()
	// Regexp match is a request-forgery barrier in CodeQL.
	if !capInstanceURLPattern.MatchString(strings.TrimRight(endpoint, "/")) {
		return "", fmt.Errorf("invalid cap siteverify url")
	}
	return out, nil
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
	// Fixed-path suffix after a fully validated base URL; only the validated URL is requested.
	safeVerifyURL := verifyURL
	if parsed, parseErr := url.Parse(safeVerifyURL); parseErr != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return false, fmt.Errorf("invalid cap siteverify url")
	}

	payload := map[string]string{
		"secret":   secretKey,
		"response": token,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return false, fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", safeVerifyURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("too many redirects")
			}
			if err := validateCapHost(req.URL.Hostname()); err != nil {
				return err
			}
			return nil
		},
	}
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
