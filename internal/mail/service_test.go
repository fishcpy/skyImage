package mail

import (
	"strings"
	"testing"
)

func TestBuildMessageSanitizesHeaderAndBody(t *testing.T) {
	msg, from, to, err := BuildMessage(
		"Sender <sender@example.com>",
		"Receiver <recv@example.com>",
		"Hello\r\nBcc: evil@evil.com",
		"Body with <script>alert(1)</script>\nand line",
	)
	if err != nil {
		t.Fatalf("BuildMessage: %v", err)
	}
	if from != "sender@example.com" || to != "recv@example.com" {
		t.Fatalf("unexpected addresses: %s %s", from, to)
	}
	s := string(msg)
	// CRLF stripped so "Bcc:" cannot start a new header line.
	if strings.Contains(s, "\r\nBcc:") || strings.Contains(s, "\nBcc:") {
		t.Fatalf("header injection not blocked: %q", s)
	}
	if !strings.Contains(s, "Subject: HelloBcc: evil@evil.com") {
		t.Fatalf("expected CRLF-stripped subject, got: %q", s)
	}
	if strings.Contains(s, "<script>") {
		t.Fatalf("body not escaped: %q", s)
	}
	if !strings.Contains(s, "&lt;script&gt;") {
		t.Fatalf("expected escaped body: %q", s)
	}
}
