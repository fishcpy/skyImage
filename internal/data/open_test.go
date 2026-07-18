package data

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestSanitizeSQLitePath(t *testing.T) {
	ok, err := SanitizeSQLitePath("storage/data/skyImage.db")
	if err != nil {
		t.Fatalf("expected ok path: %v", err)
	}
	if ok != filepath.Clean("storage/data/skyImage.db") {
		t.Fatalf("unexpected path: %q", ok)
	}

	cases := []string{
		"/etc/passwd",
		"..",
		"../etc/passwd",
		"storage/../etc/passwd",
		"notstorage/db.db",
		"storage",
		"file://storage/x.db",
		"C:\\Windows\\system32\\x.db",
	}
	for _, c := range cases {
		if _, err := SanitizeSQLitePath(c); err == nil {
			t.Fatalf("expected reject for %q", c)
		}
	}

	def, err := SanitizeSQLitePath("")
	if err != nil {
		t.Fatalf("empty default: %v", err)
	}
	if !strings.HasPrefix(def, "storage"+string(filepath.Separator)) {
		t.Fatalf("default not under storage: %q", def)
	}
}

func TestParseUserID(t *testing.T) {
	id, err := ParseUserID("1000000000000001")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if id != 1000000000000001 {
		t.Fatalf("got %d", id)
	}
	if _, err := ParseUserID("not-a-number"); err == nil {
		t.Fatal("expected error")
	}
}
