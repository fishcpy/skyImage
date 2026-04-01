package files

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/config"
	"skyimage/internal/data"
)

const tinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk6cAAAAASUVORK5CYII="

func setupFilesTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("failed to access sql db: %v", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(
		&data.Group{},
		&data.User{},
		&data.Strategy{},
		&data.GroupStrategy{},
		&data.FileAsset{},
		&data.AuditProfile{},
	); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
	return db
}

func createUploadFileHeader(t *testing.T, fileName string, payload []byte) *multipart.FileHeader {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("failed to create multipart file: %v", err)
	}
	if _, err := part.Write(payload); err != nil {
		t.Fatalf("failed to write multipart payload: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if err := req.ParseMultipartForm(int64(len(body.Bytes()) + 1024)); err != nil {
		t.Fatalf("failed to parse multipart form: %v", err)
	}
	file, _, err := req.FormFile("file")
	if err != nil {
		t.Fatalf("failed to retrieve file header: %v", err)
	}
	_ = file.Close()
	return req.MultipartForm.File["file"][0]
}

func createAuditEnabledUserAndStrategy(t *testing.T, db *gorm.DB, root string, profile data.AuditProfile, blockAction, errorAction string) (data.User, data.Strategy) {
	t.Helper()

	group := data.Group{Name: "默认组"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("failed to create group: %v", err)
	}

	user := data.User{
		Name:         "tester",
		Email:        "tester@example.com",
		PasswordHash: "hashed",
		Status:       1,
		GroupID:      &group.ID,
		Configs:      datatypes.JSON([]byte(`{}`)),
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	cfgBytes, _ := json.Marshal(map[string]interface{}{
		"driver":                   "local",
		"root":                     root,
		"url":                      "https://cdn.example.com",
		"path_template":            "{year}/{month}/{day}/{uuid}",
		"image_audit_profile_id":   profile.ID,
		"image_audit_block_action": blockAction,
		"image_audit_error_action": errorAction,
	})
	strategy := data.Strategy{
		Name:    "本地审核策略",
		Configs: datatypes.JSON(cfgBytes),
	}
	if err := db.Create(&strategy).Error; err != nil {
		t.Fatalf("failed to create strategy: %v", err)
	}
	if err := db.Create(&data.GroupStrategy{GroupID: group.ID, StrategyID: strategy.ID}).Error; err != nil {
		t.Fatalf("failed to create group strategy link: %v", err)
	}
	return user, strategy
}

func createAuditProfile(t *testing.T, db *gorm.DB, apiKey string, maxConcurrency int) data.AuditProfile {
	t.Helper()

	cfgBytes, _ := json.Marshal(map[string]interface{}{
		"api_key":         apiKey,
		"max_concurrency": maxConcurrency,
	})
	profile := data.AuditProfile{
		Name:     "审核配置",
		Provider: auditProviderUAPINSFW,
		Configs:  datatypes.JSON(cfgBytes),
	}
	if err := db.Create(&profile).Error; err != nil {
		t.Fatalf("failed to create audit profile: %v", err)
	}
	return profile
}

func TestUpload_AuditDecisions(t *testing.T) {
	imageBytes, err := base64.StdEncoding.DecodeString(tinyPNGBase64)
	if err != nil {
		t.Fatalf("failed to decode png: %v", err)
	}
	previousRetryDelays := auditRetryDelays
	auditRetryDelays = []time.Duration{10 * time.Millisecond, 20 * time.Millisecond}
	defer func() { auditRetryDelays = previousRetryDelays }()

	cases := []struct {
		name                     string
		blockAction              string
		errorAction              string
		responseStatus           int
		responseBody             string
		expectedUploadStatus     string
		expectedFinalStatus      string
		expectedEventuallyDelete bool
	}{
		{
			name:                 "pass becomes approved",
			blockAction:          auditActionDelete,
			errorAction:          auditActionKeep,
			responseStatus:       http.StatusOK,
			responseBody:         `{"suggestion":"pass","label":"normal","risk_level":"low","is_nsfw":false,"nsfw_score":0.01,"normal_score":0.99,"confidence":0.99,"inference_time_ms":12}`,
			expectedUploadStatus: auditStatusPending,
			expectedFinalStatus:  auditStatusApproved,
		},
		{
			name:                 "review remains pending",
			blockAction:          auditActionDelete,
			errorAction:          auditActionKeep,
			responseStatus:       http.StatusOK,
			responseBody:         `{"suggestion":"review","label":"nsfw","risk_level":"medium","is_nsfw":true,"nsfw_score":0.61,"normal_score":0.39,"confidence":0.77,"inference_time_ms":18}`,
			expectedUploadStatus: auditStatusPending,
			expectedFinalStatus:  auditStatusPending,
		},
		{
			name:                 "block keep becomes rejected",
			blockAction:          auditActionKeep,
			errorAction:          auditActionKeep,
			responseStatus:       http.StatusOK,
			responseBody:         `{"suggestion":"block","label":"nsfw","risk_level":"high","is_nsfw":true,"nsfw_score":0.98,"normal_score":0.02,"confidence":0.99,"inference_time_ms":25}`,
			expectedUploadStatus: auditStatusPending,
			expectedFinalStatus:  auditStatusRejected,
		},
		{
			name:                     "block delete removes uploaded file later",
			blockAction:              auditActionDelete,
			errorAction:              auditActionKeep,
			responseStatus:           http.StatusOK,
			responseBody:             `{"suggestion":"block","label":"nsfw","risk_level":"high","is_nsfw":true,"nsfw_score":0.99,"normal_score":0.01,"confidence":0.99,"inference_time_ms":21}`,
			expectedUploadStatus:     auditStatusPending,
			expectedEventuallyDelete: true,
		},
		{
			name:                 "provider error keep becomes audit error",
			blockAction:          auditActionDelete,
			errorAction:          auditActionKeep,
			responseStatus:       http.StatusInternalServerError,
			responseBody:         `{"message":"quota exceeded"}`,
			expectedUploadStatus: auditStatusPending,
			expectedFinalStatus:  auditStatusError,
		},
		{
			name:                     "provider error delete removes uploaded file later",
			blockAction:              auditActionDelete,
			errorAction:              auditActionDelete,
			responseStatus:           http.StatusInternalServerError,
			responseBody:             `{"message":"quota exceeded"}`,
			expectedUploadStatus:     auditStatusPending,
			expectedEventuallyDelete: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := setupFilesTestDB(t)
			root := t.TempDir()
			profile := createAuditProfile(t, db, "secret-key", 1)
			user, strategy := createAuditEnabledUserAndStrategy(t, db, root, profile, tc.blockAction, tc.errorAction)
			var authHeader string
			var authHeaderMu sync.Mutex
			var auditCalled atomic.Bool
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				authHeaderMu.Lock()
				authHeader = r.Header.Get("Authorization")
				authHeaderMu.Unlock()
				auditCalled.Store(true)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.responseStatus)
				_, _ = w.Write([]byte(tc.responseBody))
			}))
			defer server.Close()

			previousEndpoint := uapiNSFWEndpoint
			uapiNSFWEndpoint = server.URL
			defer func() { uapiNSFWEndpoint = previousEndpoint }()

			svc := New(db, config.Config{
				StoragePath:   root,
				PublicBaseURL: "https://cdn.example.com",
			})
			fileHeader := createUploadFileHeader(t, "sample.png", imageBytes)

			asset, err := svc.Upload(context.Background(), user, fileHeader, UploadOptions{
				Visibility: "public",
				StrategyID: strategy.ID,
			})
			if err != nil {
				t.Fatalf("Upload failed: %v", err)
			}
			waitForCondition(t, 2*time.Second, func() bool {
				return auditCalled.Load()
			})
			authHeaderMu.Lock()
			gotAuthHeader := authHeader
			authHeaderMu.Unlock()
			if gotAuthHeader != "Bearer secret-key" {
				t.Fatalf("expected API key auth header, got %q", gotAuthHeader)
			}
			if asset.AuditStatus != tc.expectedUploadStatus {
				t.Fatalf("expected upload status %q, got %q", tc.expectedUploadStatus, asset.AuditStatus)
			}
			if asset.AuditCheckedAt != nil {
				t.Fatal("expected audit checked timestamp to be empty before async audit completes")
			}
			storedPath := filepath.Clean(asset.Path)
			if !tc.expectedEventuallyDelete {
				if _, err := os.Stat(storedPath); err != nil {
					t.Fatalf("expected stored file to exist: %v", err)
				}
			}

			if tc.expectedEventuallyDelete {
				waitForCondition(t, 2*time.Second, func() bool {
					var count int64
					if err := db.Model(&data.FileAsset{}).Where("id = ?", asset.ID).Count(&count).Error; err != nil {
						return false
					}
					return count == 0
				})
				if _, err := os.Stat(storedPath); !os.IsNotExist(err) {
					t.Fatalf("expected stored file to be deleted, stat err=%v", err)
				}
				return
			}

			waitForCondition(t, 2*time.Second, func() bool {
				var refreshed data.FileAsset
				if err := db.First(&refreshed, "id = ?", asset.ID).Error; err != nil {
					return false
				}
				return refreshed.AuditStatus == tc.expectedFinalStatus && refreshed.AuditCheckedAt != nil
			})

			var refreshed data.FileAsset
			if err := db.First(&refreshed, "id = ?", asset.ID).Error; err != nil {
				t.Fatalf("failed to reload file: %v", err)
			}
			if refreshed.AuditStatus != tc.expectedFinalStatus {
				t.Fatalf("expected final audit status %q, got %q", tc.expectedFinalStatus, refreshed.AuditStatus)
			}
			if refreshed.AuditCheckedAt == nil {
				t.Fatal("expected audit checked timestamp to be set after async audit")
			}
		})
	}
}

func TestCallAuditProvider_RespectsConfiguredConcurrency(t *testing.T) {
	var inFlight int32
	var maxInFlight int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := atomic.AddInt32(&inFlight, 1)
		for {
			previous := atomic.LoadInt32(&maxInFlight)
			if current <= previous || atomic.CompareAndSwapInt32(&maxInFlight, previous, current) {
				break
			}
		}
		time.Sleep(80 * time.Millisecond)
		atomic.AddInt32(&inFlight, -1)

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"suggestion":"pass","label":"normal","risk_level":"low","is_nsfw":false,"nsfw_score":0.05,"normal_score":0.95,"confidence":0.95,"inference_time_ms":15}`))
	}))
	defer server.Close()

	previousEndpoint := uapiNSFWEndpoint
	uapiNSFWEndpoint = server.URL
	defer func() { uapiNSFWEndpoint = previousEndpoint }()

	svc := New(nil, config.Config{})
	profile := data.AuditProfile{ID: 1, Provider: auditProviderUAPINSFW}
	settings := auditProfileConfig{MaxConcurrency: 1}

	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.callAuditProvider(context.Background(), profile, settings, "sample.png", []byte("png")); err != nil {
				t.Errorf("callAuditProvider failed: %v", err)
			}
		}()
	}
	wg.Wait()

	if maxInFlight != 1 {
		t.Fatalf("expected max concurrency 1, got %d", maxInFlight)
	}
}

func TestUpload_AuditRetriesTransientProviderFailures(t *testing.T) {
	imageBytes, err := base64.StdEncoding.DecodeString(tinyPNGBase64)
	if err != nil {
		t.Fatalf("failed to decode png: %v", err)
	}
	previousRetryDelays := auditRetryDelays
	auditRetryDelays = []time.Duration{10 * time.Millisecond, 20 * time.Millisecond}
	defer func() { auditRetryDelays = previousRetryDelays }()

	db := setupFilesTestDB(t)
	root := t.TempDir()
	profile := createAuditProfile(t, db, "secret-key", 1)
	user, strategy := createAuditEnabledUserAndStrategy(t, db, root, profile, auditActionDelete, auditActionKeep)
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		currentAttempt := attempts.Add(1)
		w.Header().Set("Content-Type", "application/json")
		if currentAttempt < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"code":"SERVICE_UNAVAILABLE","message":"敏感图像检测服务暂时不可用"}`))
			return
		}
		_, _ = w.Write([]byte(`{"suggestion":"pass","label":"normal","risk_level":"low","is_nsfw":false,"nsfw_score":0.02,"normal_score":0.98,"confidence":0.97,"inference_time_ms":11}`))
	}))
	defer server.Close()

	previousEndpoint := uapiNSFWEndpoint
	uapiNSFWEndpoint = server.URL
	defer func() { uapiNSFWEndpoint = previousEndpoint }()

	svc := New(db, config.Config{
		StoragePath:   root,
		PublicBaseURL: "https://cdn.example.com",
	})
	fileHeader := createUploadFileHeader(t, "retry.png", imageBytes)

	asset, err := svc.Upload(context.Background(), user, fileHeader, UploadOptions{
		Visibility: "public",
		StrategyID: strategy.ID,
	})
	if err != nil {
		t.Fatalf("Upload failed: %v", err)
	}

	waitForCondition(t, 2*time.Second, func() bool {
		var refreshed data.FileAsset
		if err := db.First(&refreshed, "id = ?", asset.ID).Error; err != nil {
			return false
		}
		return refreshed.AuditStatus == auditStatusApproved && refreshed.AuditCheckedAt != nil
	})

	if got := attempts.Load(); got != 3 {
		t.Fatalf("expected 3 provider attempts, got %d", got)
	}
}

func TestUpdateAuditStatusByAdmin_OverridesPreviousAuditResult(t *testing.T) {
	db := setupFilesTestDB(t)
	svc := New(db, config.Config{})

	file := data.FileAsset{
		Key:          "manual-approve",
		Name:         "manual.png",
		OriginalName: "manual.png",
		Path:         "manual.png",
		PublicURL:    "https://cdn.example.com/manual.png",
		MimeType:     "image/png",
		Extension:    "png",
		Size:         128,
		AuditStatus:  auditStatusError,
		AuditResult: encodeAuditResult(storedAuditResult{
			Provider: auditProviderUAPINSFW,
			Decision: auditDecisionError,
			Message:  "敏感图像检测服务暂时不可用",
		}),
	}
	if err := db.Create(&file).Error; err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	updated, err := svc.UpdateAuditStatusByAdmin(context.Background(), file.ID, auditStatusApproved)
	if err != nil {
		t.Fatalf("UpdateAuditStatusByAdmin failed: %v", err)
	}
	if updated.AuditStatus != auditStatusApproved {
		t.Fatalf("expected audit status %q, got %q", auditStatusApproved, updated.AuditStatus)
	}
	if updated.AuditReviewedAt == nil {
		t.Fatal("expected audit reviewed timestamp to be set")
	}

	result := parseStoredAuditResult(updated.AuditResult)
	if result.Decision != auditDecisionPass {
		t.Fatalf("expected decision %q, got %q", auditDecisionPass, result.Decision)
	}
	if result.Message != "" {
		t.Fatalf("expected manual approval to clear message, got %q", result.Message)
	}
	if !result.ManualOverride {
		t.Fatal("expected manual override to be set")
	}
}

func waitForCondition(t *testing.T, timeout time.Duration, fn func() bool) {
	t.Helper()

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if fn() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition was not satisfied before timeout")
}
