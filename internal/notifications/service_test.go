package notifications

import (
	"context"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

func setupNotificationsTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	if err := db.AutoMigrate(&data.Group{}, &data.User{}, &data.UserNotification{}, &data.ConfigEntry{}); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}
	return db
}

func createNotificationUser(t *testing.T, db *gorm.DB) data.User {
	t.Helper()

	user := data.User{
		Name:         "notify",
		Email:        "notify@example.com",
		PasswordHash: "hashed",
		Status:       1,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	return user
}

func TestCreateImageDeletedByAdmin_TrimsAndFallsBackToDefaultReason(t *testing.T) {
	db := setupNotificationsTestDB(t)
	user := createNotificationUser(t, db)
	if err := db.Create(&data.ConfigEntry{Key: ConfigUserRetentionLimit, Value: "2"}).Error; err != nil {
		t.Fatalf("failed to seed retention config: %v", err)
	}
	svc := New(db)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		file := data.FileAsset{
			ID:           uint(i + 1),
			UserID:       user.ID,
			Key:          "file-key",
			OriginalName: "sample.png",
		}
		if err := svc.CreateImageDeletedByAdmin(ctx, file, ""); err != nil {
			t.Fatalf("CreateImageDeletedByAdmin failed: %v", err)
		}
	}

	var notices []data.UserNotification
	if err := db.Order("created_at DESC, id DESC").Find(&notices, "user_id = ?", user.ID).Error; err != nil {
		t.Fatalf("failed to query notifications: %v", err)
	}
	if len(notices) != 2 {
		t.Fatalf("expected 2 notifications after trimming, got %d", len(notices))
	}
	for _, notice := range notices {
		if notice.Message != DefaultAdminImageDeleteReason {
			t.Fatalf("expected fallback reason %q, got %q", DefaultAdminImageDeleteReason, notice.Message)
		}
	}
}

func TestNotificationReadListAndClear(t *testing.T) {
	db := setupNotificationsTestDB(t)
	user := createNotificationUser(t, db)
	svc := New(db)
	ctx := context.Background()

	fileA := data.FileAsset{ID: 1, UserID: user.ID, Key: "a", OriginalName: "a.png"}
	fileB := data.FileAsset{ID: 2, UserID: user.ID, Key: "b", OriginalName: "b.png"}
	if err := svc.CreateImageDeletedByAudit(ctx, fileA, ReasonAuditBlockDelete, ""); err != nil {
		t.Fatalf("CreateImageDeletedByAudit failed: %v", err)
	}
	if err := svc.CreateImageDeletedByAudit(ctx, fileB, ReasonAuditErrorDelete, "quota exceeded"); err != nil {
		t.Fatalf("CreateImageDeletedByAudit failed: %v", err)
	}

	items, err := svc.List(ctx, user.ID, "all", 20, 0)
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(items))
	}
	if _, err := svc.MarkRead(ctx, user.ID, items[0].ID, true); err != nil {
		t.Fatalf("MarkRead failed: %v", err)
	}

	unread, err := svc.List(ctx, user.ID, "unread", 20, 0)
	if err != nil {
		t.Fatalf("List unread failed: %v", err)
	}
	if len(unread) != 1 {
		t.Fatalf("expected 1 unread notification, got %d", len(unread))
	}

	if updated, err := svc.MarkAllRead(ctx, user.ID); err != nil {
		t.Fatalf("MarkAllRead failed: %v", err)
	} else if updated != 1 {
		t.Fatalf("expected MarkAllRead to update 1 row, got %d", updated)
	}

	read, err := svc.List(ctx, user.ID, "read", 20, 0)
	if err != nil {
		t.Fatalf("List read failed: %v", err)
	}
	if len(read) != 2 {
		t.Fatalf("expected 2 read notifications, got %d", len(read))
	}

	if deleted, err := svc.ClearAll(ctx, user.ID); err != nil {
		t.Fatalf("ClearAll failed: %v", err)
	} else if deleted != 2 {
		t.Fatalf("expected ClearAll to delete 2 rows, got %d", deleted)
	}
}

func TestCreateImageDeletedByAudit_UsesConfiguredSystemAutoDeleteReason(t *testing.T) {
	db := setupNotificationsTestDB(t)
	user := createNotificationUser(t, db)
	if err := db.Create(&data.ConfigEntry{
		Key:   ConfigSystemAutoDeleteReason,
		Value: "图片被系统策略自动删除",
	}).Error; err != nil {
		t.Fatalf("failed to seed auto delete config: %v", err)
	}
	svc := New(db)
	ctx := context.Background()

	file := data.FileAsset{ID: 3, UserID: user.ID, Key: "c", OriginalName: "c.png"}
	if err := svc.CreateImageDeletedByAudit(ctx, file, ReasonAuditErrorDelete, "quota exceeded"); err != nil {
		t.Fatalf("CreateImageDeletedByAudit failed: %v", err)
	}

	var notice data.UserNotification
	if err := db.First(&notice, "user_id = ?", user.ID).Error; err != nil {
		t.Fatalf("failed to load notification: %v", err)
	}
	expected := "图片被系统策略自动删除：quota exceeded"
	if notice.Message != expected {
		t.Fatalf("expected message %q, got %q", expected, notice.Message)
	}
}
