package shop

import (
	"testing"
	"time"

	"skyimage/internal/data"
)

func TestComputeMembershipFirstPurchase(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	gid := uint(1)
	user := data.User{GroupID: &gid}
	order := data.ShopOrder{PriceCents: 100, DurationDays: 30, GroupID: 2}
	expires, unit, capture, err := computeMembershipAfterPurchase(user, order, now)
	if err != nil {
		t.Fatal(err)
	}
	if !capture {
		t.Fatal("expected capture previous group")
	}
	if unit != unitPriceMicros(100, 30) {
		t.Fatalf("unit %d", unit)
	}
	want := now.Add(30 * 24 * time.Hour)
	if !expires.Equal(want) {
		t.Fatalf("expires %v want %v", expires, want)
	}
}

func TestComputeMembershipSameGroupStack(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	gid := uint(2)
	exp := now.Add(10 * 24 * time.Hour)
	user := data.User{
		GroupID:                   &gid,
		MembershipExpiresAt:       &exp,
		MembershipUnitPriceMicros: unitPriceMicros(100, 30),
	}
	order := data.ShopOrder{PriceCents: 100, DurationDays: 30, GroupID: 2}
	expires, _, capture, err := computeMembershipAfterPurchase(user, order, now)
	if err != nil {
		t.Fatal(err)
	}
	if capture {
		t.Fatal("should not recapture previous")
	}
	want := exp.Add(30 * 24 * time.Hour)
	if !expires.Equal(want) {
		t.Fatalf("expires %v want %v", expires, want)
	}
}

func TestComputeMembershipSwitchGroupCredit(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	gid := uint(2)
	// 15 days left on a 30-day / 100 fen plan => unit = 100e6/30
	exp := now.Add(15 * 24 * time.Hour)
	user := data.User{
		GroupID:                   &gid,
		MembershipExpiresAt:       &exp,
		MembershipUnitPriceMicros: unitPriceMicros(100, 30),
	}
	// new plan: 300 fen / 30 days, unit 3x
	order := data.ShopOrder{PriceCents: 300, DurationDays: 30, GroupID: 3}
	expires, newUnit, capture, err := computeMembershipAfterPurchase(user, order, now)
	if err != nil {
		t.Fatal(err)
	}
	if capture {
		t.Fatal("no capture on upgrade")
	}
	if newUnit != unitPriceMicros(300, 30) {
		t.Fatalf("unit %d", newUnit)
	}
	// credit days = 15 * (100/30) / (300/30) = 15 * 100/300 = 5
	// total = 5 + 30 = 35 days
	gotDays := expires.Sub(now).Hours() / 24
	if gotDays < 34.9 || gotDays > 35.1 {
		t.Fatalf("got days %v want ~35", gotDays)
	}
}

func TestFormatYuanViaUnit(t *testing.T) {
	if unitPriceMicros(100, 30) != 100*1_000_000/30 {
		t.Fatal("unit formula")
	}
}

func TestSanitizeReturnURL(t *testing.T) {
	base := "https://img.example.com"
	got, err := sanitizeReturnURL(base, "", "S1")
	if err != nil {
		t.Fatal(err)
	}
	if got != base+"/dashboard/orders?order_no=S1" {
		t.Fatalf("fallback: %s", got)
	}
	got, err = sanitizeReturnURL(base, "/dashboard/orders", "S1")
	if err != nil {
		t.Fatal(err)
	}
	if got != base+"/dashboard/orders" {
		t.Fatalf("relative: %s", got)
	}
	got, err = sanitizeReturnURL(base, base+"/dashboard/shop", "S1")
	if err != nil {
		t.Fatal(err)
	}
	if got != base+"/dashboard/shop" {
		t.Fatalf("absolute same origin: %s", got)
	}
	if _, err := sanitizeReturnURL(base, "https://evil.example/phish", "S1"); err == nil {
		t.Fatal("expected reject open redirect")
	}
	if _, err := sanitizeReturnURL(base, "//evil.example/phish", "S1"); err == nil {
		t.Fatal("expected reject protocol-relative")
	}
}

func TestValidateProductInputRejectsZeroPrice(t *testing.T) {
	err := validateProductInput(ProductInput{
		Name: "x", PriceCents: 0, DurationDays: 30, GroupID: 1,
	})
	if err == nil {
		t.Fatal("expected reject zero price")
	}
}
