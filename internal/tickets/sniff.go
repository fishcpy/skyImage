package tickets

import (
	"bytes"
	"errors"
	"path/filepath"
	"strings"
)

var ErrUnsupportedAttachmentType = errors.New("unsupported attachment type")

// DetectAllowedAttachmentMIME validates file content by magic bytes and optional extension.
// Returns a normalized mime type on success.
func DetectAllowedAttachmentMIME(data []byte, filename string) (string, error) {
	if len(data) == 0 {
		return "", ErrUnsupportedAttachmentType
	}
	ext := strings.ToLower(filepath.Ext(filename))
	head := data
	if len(head) > 512 {
		head = head[:512]
	}

	switch {
	case bytes.HasPrefix(head, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg", nil
	case bytes.HasPrefix(head, []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}):
		return "image/png", nil
	case bytes.HasPrefix(head, []byte("GIF87a")) || bytes.HasPrefix(head, []byte("GIF89a")):
		return "image/gif", nil
	case len(head) >= 12 && bytes.Equal(head[:4], []byte("RIFF")) && bytes.Equal(head[8:12], []byte("WEBP")):
		return "image/webp", nil
	case bytes.HasPrefix(head, []byte("%PDF-")):
		return "application/pdf", nil
	case isMostlyText(head) && (ext == ".txt" || ext == ".md" || ext == ".log" || ext == ".csv" || ext == ""):
		return "text/plain", nil
	default:
		// Explicitly reject ZIP/Office and other archives.
		return "", ErrUnsupportedAttachmentType
	}
}

func isMostlyText(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	// Reject NULs and high binary ratio.
	nonPrintable := 0
	for _, b := range data {
		if b == 0 {
			return false
		}
		if b < 7 || (b > 13 && b < 32) {
			nonPrintable++
		}
	}
	return float64(nonPrintable)/float64(len(data)) < 0.05
}
