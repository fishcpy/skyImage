package files

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestGenerateThumbnailResizesLongEdge(t *testing.T) {
	large := image.NewRGBA(image.Rect(0, 0, 200, 100))
	large.Set(0, 0, color.RGBA{R: 255, A: 255})
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, large, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode large jpeg: %v", err)
	}
	data := buf.Bytes()

	thumb, mimeType, w, h, err := GenerateThumbnail(data, "image/jpeg", ThumbnailConfig{
		MaxSize: 40,
		Quality: 25,
		Format:  "jpeg",
	})
	if err != nil {
		t.Fatalf("GenerateThumbnail returned error: %v", err)
	}
	if mimeType != "image/jpeg" {
		t.Fatalf("mime type = %q, want image/jpeg", mimeType)
	}
	if len(thumb) == 0 {
		t.Fatal("thumbnail data is empty")
	}
	if w != 200 || h != 100 {
		t.Fatalf("original dimensions = %dx%d, want 200x100", w, h)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(thumb))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	if cfg.Width != 40 || cfg.Height != 20 {
		t.Fatalf("thumbnail size = %dx%d, want 40x20", cfg.Width, cfg.Height)
	}
}

func TestBuildThumbnailRelativePath(t *testing.T) {
	got := buildThumbnailRelativePath("2024/01/02/abc.jpg", "webp")
	want := "2024/01/02/abc_thumb.webp"
	if got != want {
		t.Fatalf("path = %q, want %q", got, want)
	}
}

func TestProcessImageConvertsToWebP(t *testing.T) {
	data := encodeTestJPEG(t)

	processed, mimeType, err := ProcessImage(data, "image/jpeg", ImageProcessConfig{
		EnableCompression:  true,
		CompressionQuality: 80,
		TargetFormat:       "webp",
		SupportedFormats:   []string{"jpg", "png"},
	})
	if err != nil {
		t.Fatalf("ProcessImage returned error: %v", err)
	}
	if mimeType != "image/webp" {
		t.Fatalf("mime type = %q, want image/webp", mimeType)
	}
	if bytes.Equal(processed, data) {
		t.Fatal("processed data matches original jpeg data")
	}
	if !bytes.HasPrefix(processed, []byte("RIFF")) || !bytes.Contains(processed[:12], []byte("WEBP")) {
		t.Fatal("processed data does not look like webp")
	}
}

func TestProcessImageSkipsUnsupportedSourceFormat(t *testing.T) {
	data := encodeTestPNG(t)

	processed, mimeType, err := ProcessImage(data, "image/png", ImageProcessConfig{
		EnableCompression: true,
		TargetFormat:      "jpeg",
		SupportedFormats:  []string{"jpg"},
	})
	if err != nil {
		t.Fatalf("ProcessImage returned error: %v", err)
	}
	if mimeType != "image/png" {
		t.Fatalf("mime type = %q, want image/png", mimeType)
	}
	if !bytes.Equal(processed, data) {
		t.Fatal("unsupported source format should return original data")
	}
}

func TestProcessImageRejectsUnsupportedTargetFormat(t *testing.T) {
	_, _, err := ProcessImage(encodeTestPNG(t), "image/png", ImageProcessConfig{
		EnableCompression: true,
		TargetFormat:      "avif",
	})
	if err == nil {
		t.Fatal("expected unsupported target format error")
	}
}

func encodeTestJPEG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, testImage(), &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("failed to encode jpeg: %v", err)
	}
	return buf.Bytes()
}

func encodeTestPNG(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := png.Encode(&buf, testImage()); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}
	return buf.Bytes()
}

func testImage() image.Image {
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	img.Set(1, 0, color.RGBA{G: 255, A: 255})
	img.Set(0, 1, color.RGBA{B: 255, A: 255})
	img.Set(1, 1, color.RGBA{R: 255, G: 255, A: 255})
	return img
}
