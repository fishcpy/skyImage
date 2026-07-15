package captcha

import "testing"

func TestNormalizeCapInstanceURL(t *testing.T) {
	ok, err := NormalizeCapInstanceURL("https://cap.example.com/v1/")
	if err != nil {
		t.Fatalf("expected ok: %v", err)
	}
	if ok != "https://cap.example.com/v1" {
		t.Fatalf("unexpected normalized: %q", ok)
	}

	for _, raw := range []string{
		"http://127.0.0.1",
		"http://localhost",
		"http://10.0.0.1",
		"https://169.254.169.254",
		"ftp://example.com",
		"https://example.com?q=1",
		"https://user:pass@example.com",
	} {
		if _, err := NormalizeCapInstanceURL(raw); err == nil {
			t.Fatalf("expected reject for %q", raw)
		}
	}
}

func TestBuildCapSiteverifyURL(t *testing.T) {
	u, err := BuildCapSiteverifyURL("https://cap.example.com", "site_key-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if u != "https://cap.example.com/site_key-1/siteverify" {
		t.Fatalf("unexpected url: %q", u)
	}
	if _, err := BuildCapSiteverifyURL("https://cap.example.com", "bad/key"); err == nil {
		t.Fatal("expected invalid site key")
	}
}
