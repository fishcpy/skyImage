package redeem

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"skyimage/internal/data"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := "file:" + t.Name() + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&data.Group{}, &data.User{}, &data.RedeemCode{}, &data.RedeemCodeUsage{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestRedeemAssignsGroupAndRespectsLimits(t *testing.T) {
	db := setupTestDB(t)
	svc := New(db)
	ctx := context.Background()

	group := data.Group{Name: "VIP"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}
	admin := data.User{Name: "admin", Email: "admin@example.com", PasswordHash: "x", IsAdmin: true}
	user := data.User{Name: "user", Email: "user@example.com", PasswordHash: "x"}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	enabled := true
	groupID := group.ID
	code, err := svc.Create(ctx, admin, CreateInput{
		Code:             "VIP-TEST-0001",
		RewardType:       RewardTypeGroup,
		GroupID:          &groupID,
		MaxUses:          1,
		AllowMultiRedeem: false,
		Enabled:          &enabled,
	})
	if err != nil {
		t.Fatalf("create code: %v", err)
	}

	result, err := svc.Redeem(ctx, user, "vip-test-0001")
	if err != nil {
		t.Fatalf("redeem: %v", err)
	}
	if result.User.GroupID == nil || *result.User.GroupID != group.ID {
		t.Fatalf("expected group %d, got %#v", group.ID, result.User.GroupID)
	}

	if _, err := svc.Redeem(ctx, user, code.Code); err != ErrAlreadyRedeemed {
		t.Fatalf("expected already redeemed, got %v", err)
	}

	user2 := data.User{Name: "user2", Email: "user2@example.com", PasswordHash: "x"}
	if err := db.Create(&user2).Error; err != nil {
		t.Fatalf("create user2: %v", err)
	}
	if _, err := svc.Redeem(ctx, user2, code.Code); err != ErrCodeExhausted {
		t.Fatalf("expected exhausted, got %v", err)
	}
}

func TestAllowMultiRedeem(t *testing.T) {
	db := setupTestDB(t)
	svc := New(db)
	ctx := context.Background()

	group := data.Group{Name: "VIP2"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}
	admin := data.User{Name: "admin", Email: "a2@example.com", PasswordHash: "x", IsAdmin: true}
	user := data.User{Name: "user", Email: "u2@example.com", PasswordHash: "x"}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	enabled := true
	groupID := group.ID
	_, err := svc.Create(ctx, admin, CreateInput{
		Code:             "MULTI-CODE-0001",
		RewardType:       RewardTypeGroup,
		GroupID:          &groupID,
		MaxUses:          0,
		AllowMultiRedeem: true,
		Enabled:          &enabled,
	})
	if err != nil {
		t.Fatalf("create code: %v", err)
	}

	if _, err := svc.Redeem(ctx, user, "MULTI-CODE-0001"); err != nil {
		t.Fatalf("first redeem: %v", err)
	}
	if _, err := svc.Redeem(ctx, user, "MULTI-CODE-0001"); err != nil {
		t.Fatalf("second redeem: %v", err)
	}
}

func TestRedeemCapacityDelta(t *testing.T) {
	db := setupTestDB(t)
	svc := New(db)
	ctx := context.Background()

	admin := data.User{Name: "admin", Email: "a3@example.com", PasswordHash: "x", IsAdmin: true}
	user := data.User{Name: "user", Email: "u3@example.com", PasswordHash: "x"}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatalf("create admin: %v", err)
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	enabled := true
	delta := float64(5 * 1024 * 1024 * 1024)
	_, err := svc.Create(ctx, admin, CreateInput{
		Code:             "CAP-PLUS-0001",
		RewardType:       RewardTypeCapacity,
		CapacityDelta:    delta,
		MaxUses:          0,
		AllowMultiRedeem: true,
		Enabled:          &enabled,
	})
	if err != nil {
		t.Fatalf("create capacity code: %v", err)
	}

	if _, err := svc.Redeem(ctx, user, "CAP-PLUS-0001"); err != nil {
		t.Fatalf("redeem capacity: %v", err)
	}
	var updated data.User
	if err := db.First(&updated, user.ID).Error; err != nil {
		t.Fatalf("reload user: %v", err)
	}
	if updated.CapacityBonus != delta {
		t.Fatalf("expected bonus %v, got %v", delta, updated.CapacityBonus)
	}

	// 再兑换一次叠加
	if _, err := svc.Redeem(ctx, user, "CAP-PLUS-0001"); err != nil {
		t.Fatalf("second redeem capacity: %v", err)
	}
	if err := db.First(&updated, user.ID).Error; err != nil {
		t.Fatalf("reload user2: %v", err)
	}
	if updated.CapacityBonus != delta*2 {
		t.Fatalf("expected bonus %v, got %v", delta*2, updated.CapacityBonus)
	}
}
