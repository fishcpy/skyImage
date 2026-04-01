package files

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"gorm.io/gorm"

	"skyimage/internal/config"
	"skyimage/internal/data"
	"skyimage/internal/notifications"
)

func createAdminDeleteTestUser(t *testing.T, db *gorm.DB) data.User {
	t.Helper()
	user := data.User{
		Name:         "admin-delete-user",
		Email:        "admin-delete@example.com",
		PasswordHash: "hashed",
		Status:       1,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	return user
}

func createAdminDeleteTestFile(t *testing.T, db *gorm.DB, root string, userID uint, suffix string) data.FileAsset {
	t.Helper()
	fullPath := filepath.Join(root, "admin-delete-"+suffix+".png")
	if err := os.WriteFile(fullPath, []byte("image"), 0o644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}
	file := data.FileAsset{
		UserID:          userID,
		Key:             "admin-delete-" + suffix,
		Name:            "admin-delete-" + suffix + ".png",
		OriginalName:    "admin-delete-" + suffix + ".png",
		Path:            fullPath,
		RelativePath:    "admin-delete-" + suffix + ".png",
		PublicURL:       "https://cdn.example.com/admin-delete-" + suffix + ".png",
		Size:            int64(len("image")),
		MimeType:        "image/png",
		Extension:       "png",
		StorageProvider: "local",
	}
	if err := db.Create(&file).Error; err != nil {
		t.Fatalf("failed to create file: %v", err)
	}
	return file
}

func TestDeleteByAdmin_CreatesNotificationWithDefaultReason(t *testing.T) {
	db := setupFilesTestDB(t)
	root := t.TempDir()
	if err := db.Create(&data.ConfigEntry{
		Key:   notifications.ConfigAdminImageDeleteReason,
		Value: "系统默认删除原因",
	}).Error; err != nil {
		t.Fatalf("failed to seed config: %v", err)
	}
	user := createAdminDeleteTestUser(t, db)
	file := createAdminDeleteTestFile(t, db, root, user.ID, "single")

	svc := New(db, config.Config{StoragePath: root, PublicBaseURL: "https://cdn.example.com"})
	if err := svc.DeleteByAdmin(context.Background(), file.ID, ""); err != nil {
		t.Fatalf("DeleteByAdmin failed: %v", err)
	}

	var notice data.UserNotification
	if err := db.First(&notice, "user_id = ?", user.ID).Error; err != nil {
		t.Fatalf("failed to load notification: %v", err)
	}
	if notice.Message != "系统默认删除原因" {
		t.Fatalf("expected default notification reason, got %q", notice.Message)
	}
	var metadata map[string]interface{}
	if err := json.Unmarshal(notice.Metadata, &metadata); err != nil {
		t.Fatalf("failed to parse metadata: %v", err)
	}
	if metadata["reasonType"] != notifications.ReasonAdminDelete {
		t.Fatalf("expected reasonType %q, got %v", notifications.ReasonAdminDelete, metadata["reasonType"])
	}
	if _, err := os.Stat(file.Path); !os.IsNotExist(err) {
		t.Fatalf("expected stored object to be removed, stat err=%v", err)
	}
}

func TestDeleteByAdminBatch_CreatesNotificationsWithCustomReason(t *testing.T) {
	db := setupFilesTestDB(t)
	root := t.TempDir()
	user := createAdminDeleteTestUser(t, db)
	fileA := createAdminDeleteTestFile(t, db, root, user.ID, "batch-a")
	fileB := createAdminDeleteTestFile(t, db, root, user.ID, "batch-b")

	svc := New(db, config.Config{StoragePath: root, PublicBaseURL: "https://cdn.example.com"})
	deleted, err := svc.DeleteByAdminBatch(context.Background(), []uint{fileA.ID, fileB.ID}, "批量删除原因")
	if err != nil {
		t.Fatalf("DeleteByAdminBatch failed: %v", err)
	}
	if deleted != 2 {
		t.Fatalf("expected 2 deleted rows, got %d", deleted)
	}

	var notices []data.UserNotification
	if err := db.Order("id ASC").Find(&notices, "user_id = ?", user.ID).Error; err != nil {
		t.Fatalf("failed to load notifications: %v", err)
	}
	if len(notices) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(notices))
	}
	for _, notice := range notices {
		if notice.Message != "批量删除原因" {
			t.Fatalf("expected custom reason, got %q", notice.Message)
		}
	}
}
