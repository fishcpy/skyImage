package files

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"strings"

	webp "github.com/HugoSmits86/nativewebp"
	"golang.org/x/image/bmp"
	"golang.org/x/image/tiff"
	webpdecode "golang.org/x/image/webp"
)

type ImageProcessConfig struct {
	EnableCompression  bool
	CompressionQuality int
	TargetFormat       string
	SupportedFormats   []string
}

func ProcessImage(data []byte, mimeType string, config ImageProcessConfig) ([]byte, string, error) {
	if !config.EnableCompression && config.TargetFormat == "" {
		return data, mimeType, nil
	}

	if !isSupportedImageFormat(mimeType, config.SupportedFormats) {
		return data, mimeType, nil
	}

	img, format, err := decodeImage(bytes.NewReader(data), mimeType)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode image: %w", err)
	}

	targetFormat := normalizeImageFormat(config.TargetFormat)
	if targetFormat == "" {
		targetFormat = normalizeImageFormat(format)
	}

	if !isSupportedTargetFormat(targetFormat, config.SupportedFormats) {
		return nil, "", fmt.Errorf("unsupported target image format: %s", targetFormat)
	}

	var buf bytes.Buffer
	newMimeType, err := encodeImage(&buf, img, targetFormat, config.CompressionQuality)
	if err != nil {
		return nil, "", err
	}

	return buf.Bytes(), newMimeType, nil
}

func decodeImage(r io.Reader, mimeType string) (image.Image, string, error) {
	switch mimeType {
	case "image/jpeg":
		img, err := jpeg.Decode(r)
		return img, "jpeg", err
	case "image/png":
		img, err := png.Decode(r)
		return img, "png", err
	case "image/gif":
		img, err := gif.Decode(r)
		return img, "gif", err
	case "image/webp":
		img, err := webpdecode.Decode(r)
		return img, "webp", err
	case "image/bmp":
		img, err := bmp.Decode(r)
		return img, "bmp", err
	case "image/tiff":
		img, err := tiff.Decode(r)
		return img, "tiff", err
	default:
		img, format, err := image.Decode(r)
		return img, normalizeImageFormat(format), err
	}
}

func encodeImage(w io.Writer, img image.Image, format string, quality int) (string, error) {
	format = normalizeImageFormat(format)
	if quality <= 0 || quality > 100 {
		quality = 85
	}

	switch format {
	case "jpeg":
		err := jpeg.Encode(w, img, &jpeg.Options{Quality: quality})
		return "image/jpeg", err
	case "png":
		encoder := png.Encoder{CompressionLevel: png.DefaultCompression}
		err := encoder.Encode(w, img)
		return "image/png", err
	case "gif":
		err := gif.Encode(w, img, nil)
		return "image/gif", err
	case "webp":
		err := webp.Encode(w, img, &webp.Options{CompressionLevel: webpCompressionLevel(quality)})
		return "image/webp", err
	case "bmp":
		err := bmp.Encode(w, img)
		return "image/bmp", err
	case "tiff":
		err := tiff.Encode(w, img, nil)
		return "image/tiff", err
	default:
		return "", fmt.Errorf("unsupported image format: %s", format)
	}
}

func isSupportedImageFormat(mimeType string, supportedFormats []string) bool {
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	if len(supportedFormats) == 0 {
		switch mimeType {
		case "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff":
			return true
		default:
			return false
		}
	}

	for _, format := range supportedFormats {
		format = normalizeImageFormat(format)
		if format == "" {
			continue
		}
		if mimeType == "image/"+format {
			return true
		}
		if format == "jpeg" && mimeType == "image/jpeg" {
			return true
		}
	}
	return false
}

func isSupportedTargetFormat(targetFormat string, supportedFormats []string) bool {
	targetFormat = normalizeImageFormat(targetFormat)
	switch targetFormat {
	case "jpeg", "png", "gif", "webp", "bmp", "tiff":
		return true
	default:
		return false
	}
}

func normalizeImageFormat(format string) string {
	format = strings.ToLower(strings.TrimSpace(format))
	format = strings.TrimPrefix(format, ".")
	format = strings.TrimPrefix(format, "image/")
	switch format {
	case "jpg", "jpeg":
		return "jpeg"
	case "tif", "tiff":
		return "tiff"
	default:
		return format
	}
}

func webpCompressionLevel(quality int) webp.CompressionLevel {
	if quality <= 70 {
		return webp.BestCompression
	}
	if quality >= 95 {
		return webp.BestSpeed
	}
	return webp.DefaultCompression
}

func GetExtensionForMimeType(mimeType string) string {
	switch mimeType {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	case "image/bmp":
		return "bmp"
	case "image/tiff":
		return "tiff"
	default:
		return ""
	}
}
