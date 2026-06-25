package files

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"skyimage/internal/data"
	"skyimage/internal/notifications"
)

const (
	auditProviderUAPINSFW  = "uapis_nsfw"
	auditProviderTencentCI = "tencent_ci"

	auditStatusNone     = "none"
	auditStatusApproved = "approved"
	auditStatusPending  = "pending"
	auditStatusRejected = "rejected"
	auditStatusError    = "error"

	auditDecisionPass   = "pass"
	auditDecisionReview = "review"
	auditDecisionBlock  = "block"
	auditDecisionError  = "error"

	auditActionDelete = "delete"
	auditActionKeep   = "keep"
)

var uapiNSFWEndpoint = "https://uapis.cn/api/v1/image/nsfw"
var tencentCIEndpoint = "https://ci.tencentcloudapi.com"

var auditRetryDelays = []time.Duration{
	5 * time.Second,
	15 * time.Second,
	30 * time.Second,
	60 * time.Second,
}

type StatusError struct {
	StatusCode int
	Message    string
}

func (e *StatusError) Error() string {
	return e.Message
}

type auditCallError struct {
	message    string
	raw        json.RawMessage
	statusCode int
	retryable  bool
}

func (e *auditCallError) Error() string {
	return e.message
}

type auditProfileConfig struct {
	APIKey         string
	MaxConcurrency int
}

type storedAuditResult struct {
	Provider        string          `json:"provider,omitempty"`
	Decision        string          `json:"decision,omitempty"`
	Label           string          `json:"label,omitempty"`
	RiskLevel       string          `json:"riskLevel,omitempty"`
	IsNSFW          bool            `json:"isNsfw"`
	NSFWScore       float64         `json:"nsfwScore,omitempty"`
	NormalScore     float64         `json:"normalScore,omitempty"`
	Confidence      float64         `json:"confidence,omitempty"`
	InferenceTimeMs int             `json:"inferenceTimeMs,omitempty"`
	Message         string          `json:"message,omitempty"`
	Raw             json.RawMessage `json:"raw,omitempty"`
	ManualOverride  bool            `json:"manualOverride,omitempty"`
}

type FileAuditDTO struct {
	Status     string     `json:"status"`
	Decision   string     `json:"decision,omitempty"`
	Provider   string     `json:"provider,omitempty"`
	RiskLevel  string     `json:"riskLevel,omitempty"`
	Label      string     `json:"label,omitempty"`
	NSFWScore  float64    `json:"nsfwScore,omitempty"`
	Confidence float64    `json:"confidence,omitempty"`
	Message    string     `json:"message,omitempty"`
	CheckedAt  *time.Time `json:"checkedAt,omitempty"`
	ReviewedAt *time.Time `json:"reviewedAt,omitempty"`
}

type uapiNSFWResponse struct {
	NSFWScore       float64 `json:"nsfw_score"`
	NormalScore     float64 `json:"normal_score"`
	IsNSFW          bool    `json:"is_nsfw"`
	Label           string  `json:"label"`
	Suggestion      string  `json:"suggestion"`
	RiskLevel       string  `json:"risk_level"`
	Confidence      float64 `json:"confidence"`
	InferenceTimeMs int     `json:"inference_time_ms"`
	Code            string  `json:"code"`
	Message         string  `json:"message"`
}

type tencentCIProfileConfig struct {
	SecretID       string
	SecretKey      string
	Region         string
	Bucket         string
	AppID          string
	BizType        string
	MaxConcurrency int
}

type tencentCIBatchResponse struct {
	RequestId  string               `json:"RequestId"`
	JobsDetail []tencentCIJobDetail `json:"JobsDetail"`
}

type tencentCIJobDetail struct {
	Code       int                 `json:"Code"`
	Message    string              `json:"Message"`
	DataId     string              `json:"DataId"`
	Result     int                 `json:"Result"`
	Label      string              `json:"Label"`
	SubLabel   string              `json:"SubLabel"`
	Score      int                 `json:"Score"`
	Suggestion string              `json:"Suggestion"`
	PornInfo   *tencentCISceneInfo `json:"PornInfo"`
	AdsInfo    *tencentCISceneInfo `json:"AdsInfo"`
}

type tencentCISceneInfo struct {
	Code     int    `json:"Code"`
	HitFlag  int    `json:"HitFlag"`
	Score    int    `json:"Score"`
	Label    string `json:"Label"`
	SubLabel string `json:"SubLabel"`
}

func parseTencentCIProfileConfig(profile data.AuditProfile) tencentCIProfileConfig {
	cfg := tencentCIProfileConfig{Region: "ap-guangzhou", MaxConcurrency: 1}
	if len(profile.Configs) == 0 {
		return cfg
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(profile.Configs, &raw); err != nil {
		return cfg
	}
	cfg.SecretID = strings.TrimSpace(firstString(raw, "secret_id", "secretId"))
	cfg.SecretKey = strings.TrimSpace(firstString(raw, "secret_key", "secretKey"))
	if v := strings.TrimSpace(firstString(raw, "region")); v != "" {
		cfg.Region = v
	}
	cfg.Bucket = strings.TrimSpace(firstString(raw, "bucket"))
	cfg.AppID = strings.TrimSpace(firstString(raw, "app_id", "appId"))
	cfg.BizType = strings.TrimSpace(firstString(raw, "biz_type", "bizType"))
	cfg.MaxConcurrency = intFromAny(raw["max_concurrency"])
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = intFromAny(raw["maxConcurrency"])
	}
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = 1
	}
	return cfg
}

func normalizeAuditAction(value string, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case auditActionDelete, auditActionKeep:
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return fallback
	}
}

func parseAuditProfileConfig(profile data.AuditProfile) auditProfileConfig {
	cfg := auditProfileConfig{MaxConcurrency: 1}
	if len(profile.Configs) == 0 {
		return cfg
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(profile.Configs, &raw); err != nil {
		return cfg
	}
	cfg.APIKey = strings.TrimSpace(firstString(raw, "api_key", "apiKey"))
	cfg.MaxConcurrency = intFromAny(raw["max_concurrency"])
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = intFromAny(raw["maxConcurrency"])
	}
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = 1
	}
	return cfg
}

func firstString(values map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			if result := stringFromAny(value); strings.TrimSpace(result) != "" {
				return result
			}
		}
	}
	return ""
}

func shouldAuditImage(cfg strategyConfig, contentType string) bool {
	return cfg.ImageAuditProfileID > 0 && strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "image/")
}

func initialAuditStatus(cfg strategyConfig, contentType string) string {
	if !shouldAuditImage(cfg, contentType) {
		return auditStatusNone
	}
	return auditStatusPending
}

func (s *Service) queueAuditUpload(file data.FileAsset, cfg strategyConfig, fileName string, dataBytes []byte) {
	if !shouldAuditImage(cfg, file.MimeType) || len(dataBytes) == 0 {
		return
	}
	payload := append([]byte(nil), dataBytes...)
	go s.processAuditUpload(context.Background(), file, cfg, fileName, payload)
}

func (s *Service) processAuditUpload(ctx context.Context, file data.FileAsset, cfg strategyConfig, fileName string, dataBytes []byte) {
	if file.ID == 0 || cfg.ImageAuditProfileID == 0 || len(dataBytes) == 0 {
		return
	}
	profile, settings, err := s.findAuditProfile(ctx, cfg.ImageAuditProfileID)
	if err != nil {
		s.completeAuditFailure(ctx, file, cfg, time.Now(), profile.Provider, fmt.Sprintf("加载图片审核配置失败: %v", err), nil)
		return
	}
	result, checkedAt, err := s.callAuditProviderWithRetry(ctx, profile, settings, fileName, dataBytes, file.PublicURL)
	if err != nil {
		var providerErr *auditCallError
		if errors.As(err, &providerErr) {
			s.completeAuditFailure(ctx, file, cfg, checkedAt, profile.Provider, providerErr.message, providerErr.raw)
			return
		}
		s.completeAuditFailure(ctx, file, cfg, checkedAt, profile.Provider, err.Error(), nil)
		return
	}
	encoded := encodeAuditResult(result)
	switch result.Decision {
	case auditDecisionPass:
		_ = s.persistAuditResult(ctx, file.ID, auditStatusApproved, encoded, &checkedAt)
	case auditDecisionReview:
		_ = s.persistAuditResult(ctx, file.ID, auditStatusPending, encoded, &checkedAt)
	case auditDecisionBlock:
		if normalizeAuditAction(cfg.ImageAuditBlockAction, auditActionDelete) == auditActionDelete {
			_ = s.deleteAfterAudit(ctx, file, notifications.ReasonAuditBlockDelete, "")
			return
		}
		_ = s.persistAuditResult(ctx, file.ID, auditStatusRejected, encoded, &checkedAt)
	default:
		s.completeAuditFailure(ctx, file, cfg, checkedAt, profile.Provider, "审核服务返回了无法识别的结果", result.Raw)
	}
}

func (s *Service) callAuditProviderWithRetry(
	ctx context.Context,
	profile data.AuditProfile,
	settings auditProfileConfig,
	fileName string,
	dataBytes []byte,
	publicURL string,
) (storedAuditResult, time.Time, error) {
	var checkedAt time.Time
	for attempt := 0; ; attempt++ {
		checkedAt = time.Now()
		result, err := s.callAuditProvider(ctx, profile, settings, fileName, dataBytes, publicURL)
		if err == nil {
			return result, checkedAt, nil
		}
		if !shouldRetryAuditCall(err) || attempt >= len(auditRetryDelays) {
			return storedAuditResult{}, checkedAt, err
		}
		if !sleepWithContext(ctx, auditRetryDelays[attempt]) {
			return storedAuditResult{}, checkedAt, err
		}
	}
}

func (s *Service) completeAuditFailure(
	ctx context.Context,
	file data.FileAsset,
	cfg strategyConfig,
	checkedAt time.Time,
	provider string,
	message string,
	raw json.RawMessage,
) {
	result := storedAuditResult{
		Provider: provider,
		Decision: auditDecisionError,
		Message:  strings.TrimSpace(message),
		Raw:      raw,
	}
	if normalizeAuditAction(cfg.ImageAuditErrorAction, auditActionKeep) == auditActionDelete {
		_ = s.deleteAfterAudit(ctx, file, notifications.ReasonAuditErrorDelete, message)
		return
	}
	_ = s.persistAuditResult(ctx, file.ID, auditStatusError, encodeAuditResult(result), &checkedAt)
}

func (s *Service) findAuditProfile(ctx context.Context, id uint) (data.AuditProfile, auditProfileConfig, error) {
	var profile data.AuditProfile
	if err := s.db.WithContext(ctx).First(&profile, id).Error; err != nil {
		return data.AuditProfile{}, auditProfileConfig{}, err
	}
	return profile, parseAuditProfileConfig(profile), nil
}

func (s *Service) callAuditProvider(ctx context.Context, profile data.AuditProfile, settings auditProfileConfig, fileName string, dataBytes []byte, publicURL string) (storedAuditResult, error) {
	provider := strings.ToLower(strings.TrimSpace(profile.Provider))
	if provider == "" {
		provider = auditProviderUAPINSFW
	}
	release := s.acquireAuditSlot(profile.ID, settings.MaxConcurrency)
	defer release()

	switch provider {
	case auditProviderUAPINSFW:
		return s.callUAPIProvider(ctx, settings, fileName, dataBytes)
	case auditProviderTencentCI:
		return s.callTencentCIProvider(ctx, profile, publicURL)
	default:
		return storedAuditResult{}, fmt.Errorf("不支持的审核服务提供商: %s", provider)
	}
}

func (s *Service) callUAPIProvider(ctx context.Context, settings auditProfileConfig, fileName string, dataBytes []byte) (storedAuditResult, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return storedAuditResult{}, fmt.Errorf("创建审核请求失败")
	}
	if _, err := part.Write(dataBytes); err != nil {
		return storedAuditResult{}, fmt.Errorf("写入审核文件失败")
	}
	if err := writer.Close(); err != nil {
		return storedAuditResult{}, fmt.Errorf("生成审核请求失败")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, uapiNSFWEndpoint, &body)
	if err != nil {
		return storedAuditResult{}, fmt.Errorf("创建审核请求失败")
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if settings.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+settings.APIKey)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return storedAuditResult{}, &auditCallError{
			message:   fmt.Sprintf("调用图片审核服务失败: %v", err),
			retryable: true,
		}
	}
	defer resp.Body.Close()

	rawBody, err := ioReadAllLimit(resp.Body, 2*1024*1024)
	if err != nil {
		return storedAuditResult{}, fmt.Errorf("读取审核结果失败")
	}
	encodedRaw := normalizeAuditRaw(rawBody)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := fmt.Sprintf("图片审核服务响应异常: HTTP %d", resp.StatusCode)
		var failed uapiNSFWResponse
		if len(rawBody) > 0 && json.Unmarshal(rawBody, &failed) == nil {
			if strings.TrimSpace(failed.Message) != "" {
				message = failed.Message
			}
		}
		return storedAuditResult{}, &auditCallError{
			message:    message,
			raw:        encodedRaw,
			statusCode: resp.StatusCode,
			retryable:  resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= http.StatusInternalServerError,
		}
	}

	var payload uapiNSFWResponse
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return storedAuditResult{}, &auditCallError{message: "图片审核服务返回了无效数据", raw: encodedRaw}
	}
	decision := strings.ToLower(strings.TrimSpace(payload.Suggestion))
	if decision != auditDecisionPass && decision != auditDecisionReview && decision != auditDecisionBlock {
		return storedAuditResult{}, &auditCallError{message: "图片审核服务返回了无效建议", raw: encodedRaw}
	}

	return storedAuditResult{
		Provider:        auditProviderUAPINSFW,
		Decision:        decision,
		Label:           strings.TrimSpace(payload.Label),
		RiskLevel:       strings.TrimSpace(payload.RiskLevel),
		IsNSFW:          payload.IsNSFW,
		NSFWScore:       payload.NSFWScore,
		NormalScore:     payload.NormalScore,
		Confidence:      payload.Confidence,
		InferenceTimeMs: payload.InferenceTimeMs,
		Message:         strings.TrimSpace(payload.Message),
		Raw:             encodedRaw,
	}, nil
}

func (s *Service) callTencentCIProvider(ctx context.Context, profile data.AuditProfile, publicURL string) (storedAuditResult, error) {
	if strings.TrimSpace(publicURL) == "" {
		return storedAuditResult{}, &auditCallError{message: "图片公开链接为空，无法调用腾讯云审核"}
	}
	cfg := parseTencentCIProfileConfig(profile)
	if cfg.SecretID == "" || cfg.SecretKey == "" {
		return storedAuditResult{}, &auditCallError{message: "腾讯云审核配置缺少 SecretID 或 SecretKey"}
	}

	payload := map[string]interface{}{
		"Input": map[string]interface{}{
			"Url": publicURL,
		},
	}
	if cfg.BizType != "" {
		payload["Conf"] = map[string]interface{}{
			"BizType": cfg.BizType,
		}
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return storedAuditResult{}, fmt.Errorf("生成审核请求失败")
	}

	timestamp := time.Now().Unix()
	headers, signedHeaders, signature := signTencentRequest(
		cfg.SecretID, cfg.SecretKey, cfg.Region,
		"ci", "ImageAuditing", "2019-03-18",
		string(bodyBytes), timestamp,
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tencentCIEndpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return storedAuditResult{}, fmt.Errorf("创建审核请求失败")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-TC-Action", "ImageAuditing")
	req.Header.Set("X-TC-Version", "2019-03-18")
	req.Header.Set("X-TC-Region", cfg.Region)
	req.Header.Set("X-TC-Timestamp", strconv.FormatInt(timestamp, 10))
	req.Header.Set("Authorization", fmt.Sprintf(
		"TC3-HMAC-SHA256 Credential=%s/%s/%s/tc3_request, SignedHeaders=%s, Signature=%s",
		cfg.SecretID, time.Unix(timestamp, 0).UTC().Format("2006-01-02"),
		"ci", signedHeaders, signature,
	))
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return storedAuditResult{}, &auditCallError{
			message:   fmt.Sprintf("调用腾讯云图片审核服务失败: %v", err),
			retryable: true,
		}
	}
	defer resp.Body.Close()

	rawBody, err := ioReadAllLimit(resp.Body, 2*1024*1024)
	if err != nil {
		return storedAuditResult{}, fmt.Errorf("读取审核结果失败")
	}
	encodedRaw := normalizeAuditRaw(rawBody)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := fmt.Sprintf("腾讯云图片审核服务响应异常: HTTP %d", resp.StatusCode)
		var errResp struct {
			Response struct {
				Error struct {
					Code    string `json:"Code"`
					Message string `json:"Message"`
				} `json:"Error"`
			} `json:"Response"`
		}
		if len(rawBody) > 0 && json.Unmarshal(rawBody, &errResp) == nil {
			if strings.TrimSpace(errResp.Response.Error.Message) != "" {
				message = errResp.Response.Error.Message
			}
		}
		return storedAuditResult{}, &auditCallError{
			message:    message,
			raw:        encodedRaw,
			statusCode: resp.StatusCode,
			retryable:  resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= http.StatusInternalServerError,
		}
	}

	var batchResp tencentCIBatchResponse
	if err := json.Unmarshal(rawBody, &batchResp); err != nil {
		return storedAuditResult{}, &auditCallError{message: "腾讯云图片审核服务返回了无效数据", raw: encodedRaw}
	}
	if len(batchResp.JobsDetail) == 0 {
		return storedAuditResult{}, &auditCallError{message: "腾讯云图片审核服务返回了空结果", raw: encodedRaw}
	}

	job := batchResp.JobsDetail[0]
	if job.Code != 0 {
		return storedAuditResult{}, &auditCallError{
			message:    fmt.Sprintf("腾讯云图片审核失败: [%d] %s", job.Code, job.Message),
			raw:        encodedRaw,
			retryable:  false,
		}
	}

	var decision string
	switch job.Result {
	case 0:
		decision = auditDecisionPass
	case 1:
		decision = auditDecisionBlock
	case 2:
		decision = auditDecisionReview
	default:
		return storedAuditResult{}, &auditCallError{message: "腾讯云图片审核服务返回了无法识别的结果", raw: encodedRaw}
	}

	label := strings.TrimSpace(job.Label)
	if sub := strings.TrimSpace(job.SubLabel); sub != "" {
		label = label + "/" + sub
	}

	score := float64(job.Score) / 100.0
	riskLevel := "low"
	if job.Score >= 90 {
		riskLevel = "high"
	} else if job.Score >= 60 {
		riskLevel = "medium"
	}

	return storedAuditResult{
		Provider:    auditProviderTencentCI,
		Decision:    decision,
		Label:       label,
		RiskLevel:   riskLevel,
		IsNSFW:      strings.EqualFold(strings.TrimSpace(job.Label), "Porn"),
		NSFWScore:   score,
		NormalScore: 1.0 - score,
		Confidence:  score,
		Message:     strings.TrimSpace(job.Message),
		Raw:         encodedRaw,
	}, nil
}

func signTencentRequest(secretID, secretKey, region, service, action, version, payload string, timestamp int64) (map[string]string, string, string) {
	date := time.Unix(timestamp, 0).UTC().Format("2006-01-02")

	// Step 1: Canonical request
	hashedPayload := sha256Hex(payload)
	canonicalHeaders := fmt.Sprintf("content-type:application/json\nhost:ci.tencentcloudapi.com\nx-tc-action:%s\n", strings.ToLower(action))
	signedHeaders := "content-type;host;x-tc-action"
	canonicalRequest := fmt.Sprintf("POST\n/\n\n%s\n%s\n%s",
		canonicalHeaders, signedHeaders, hashedPayload)

	// Step 2: String to sign
	credentialScope := fmt.Sprintf("%s/%s/tc3_request", date, service)
	stringToSign := fmt.Sprintf("TC3-HMAC-SHA256\n%d\n%s\n%s",
		timestamp, credentialScope, sha256Hex(canonicalRequest))

	// Step 3: Signature
	secretDate := hmacSHA256([]byte("TC3"+secretKey), date)
	secretService := hmacSHA256(secretDate, service)
	secretSigning := hmacSHA256(secretService, "tc3_request")
	signature := hmacSHA256Hex(secretSigning, stringToSign)

	return map[string]string{
		"Host":         "ci.tencentcloudapi.com",
		"X-TC-Action":  action,
		"X-TC-Version": version,
		"X-TC-Region":  region,
	}, signedHeaders, signature
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func hmacSHA256Hex(key []byte, data string) string {
	return hex.EncodeToString(hmacSHA256(key, data))
}

func shouldRetryAuditCall(err error) bool {
	var callErr *auditCallError
	if errors.As(err, &callErr) {
		return callErr.retryable
	}
	return false
}

func sleepWithContext(ctx context.Context, delay time.Duration) bool {
	if delay <= 0 {
		return true
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func encodeAuditResult(result storedAuditResult) datatypes.JSON {
	if result.Decision == "" && result.Provider == "" && result.Message == "" && len(result.Raw) == 0 {
		return nil
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return nil
	}
	return datatypes.JSON(encoded)
}

func normalizeAuditRaw(raw []byte) json.RawMessage {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil
	}
	if json.Valid(trimmed) {
		return json.RawMessage(trimmed)
	}
	encoded, _ := json.Marshal(map[string]string{"body": string(trimmed)})
	return json.RawMessage(encoded)
}

func parseStoredAuditResult(value datatypes.JSON) storedAuditResult {
	if len(value) == 0 {
		return storedAuditResult{}
	}
	var result storedAuditResult
	_ = json.Unmarshal(value, &result)
	return result
}

func buildFileAuditDTO(file data.FileAsset) *FileAuditDTO {
	status := strings.ToLower(strings.TrimSpace(file.AuditStatus))
	if status == "" {
		status = auditStatusNone
	}
	result := parseStoredAuditResult(file.AuditResult)
	if status == auditStatusNone && result.Decision == "" && result.Provider == "" && file.AuditCheckedAt == nil && file.AuditReviewedAt == nil {
		return &FileAuditDTO{Status: status}
	}
	return &FileAuditDTO{
		Status:     status,
		Decision:   result.Decision,
		Provider:   result.Provider,
		RiskLevel:  result.RiskLevel,
		Label:      result.Label,
		NSFWScore:  result.NSFWScore,
		Confidence: result.Confidence,
		Message:    result.Message,
		CheckedAt:  file.AuditCheckedAt,
		ReviewedAt: file.AuditReviewedAt,
	}
}

func (s *Service) UpdateAuditStatusByAdmin(ctx context.Context, id uint, status string) (data.FileAsset, error) {
	if strings.ToLower(strings.TrimSpace(status)) != auditStatusApproved {
		return data.FileAsset{}, fmt.Errorf("仅支持将审核状态更新为 approved")
	}
	var file data.FileAsset
	if err := s.db.WithContext(ctx).First(&file, "id = ?", id).Error; err != nil {
		return data.FileAsset{}, err
	}
	now := time.Now()
	result := parseStoredAuditResult(file.AuditResult)
	result.ManualOverride = true
	result.Decision = auditDecisionPass
	result.Message = ""
	encoded := encodeAuditResult(result)
	if err := s.db.WithContext(ctx).Model(&data.FileAsset{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"audit_status":      auditStatusApproved,
			"audit_result":      encoded,
			"audit_reviewed_at": &now,
		}).Error; err != nil {
		return data.FileAsset{}, err
	}
	file.AuditStatus = auditStatusApproved
	file.AuditResult = encoded
	file.AuditReviewedAt = &now
	return file, nil
}

func (s *Service) persistAuditResult(ctx context.Context, fileID uint, status string, result datatypes.JSON, checkedAt *time.Time) error {
	if fileID == 0 {
		return nil
	}
	var file data.FileAsset
	if err := s.db.WithContext(ctx).First(&file, "id = ?", fileID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if shouldSkipAuditUpdate(file) {
		return nil
	}
	return s.db.WithContext(ctx).Model(&data.FileAsset{}).
		Where("id = ?", fileID).
		Updates(map[string]interface{}{
			"audit_status":     status,
			"audit_result":     result,
			"audit_checked_at": checkedAt,
		}).Error
}

func (s *Service) deleteAfterAudit(ctx context.Context, file data.FileAsset, reasonType, auditMessage string) error {
	if file.ID == 0 {
		return nil
	}
	var current data.FileAsset
	if err := s.db.WithContext(ctx).First(&current, "id = ?", file.ID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if shouldSkipAuditUpdate(current) {
		return nil
	}
	if err := s.Delete(ctx, current.UserID, current.ID); err != nil {
		return err
	}
	return s.notifyAuditDeleted(ctx, current, reasonType, auditMessage)
}

func shouldSkipAuditUpdate(file data.FileAsset) bool {
	if file.AuditReviewedAt != nil {
		return true
	}
	result := parseStoredAuditResult(file.AuditResult)
	return result.ManualOverride
}

func ioReadAllLimit(body io.ReadCloser, limit int64) ([]byte, error) {
	defer body.Close()
	return io.ReadAll(io.LimitReader(body, limit))
}

func (s *Service) acquireAuditSlot(profileID uint, limit int) func() {
	if limit <= 0 {
		limit = 1
	}
	s.auditLimiterMu.Lock()
	if s.auditLimiters == nil {
		s.auditLimiters = make(map[uint]*auditLimiterEntry)
	}
	entry, ok := s.auditLimiters[profileID]
	if !ok || entry.limit != limit {
		entry = &auditLimiterEntry{
			limit:  limit,
			tokens: make(chan struct{}, limit),
		}
		s.auditLimiters[profileID] = entry
	}
	s.auditLimiterMu.Unlock()

	entry.tokens <- struct{}{}
	return func() {
		<-entry.tokens
	}
}

type auditLimiterEntry struct {
	limit  int
	tokens chan struct{}
}
