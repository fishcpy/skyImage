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

	"golang.org/x/image/bmp"
	"golang.org/x/image/tiff"
	webpdecode "golang.org/x/image/webp"
)

// ImageProcessConfig 图片处理配置
type ImageProcessConfig struct {
	EnableCompression  bool     // 是否启用压缩
	CompressionQuality int      // 压缩质量 (1-100)
	TargetFormat       string   // 目标格式 (webp, png, jpeg 等)
	SupportedFormats   []string // 支持处理的格式
}

// ProcessImage 处理图片：压缩和格式转换
func ProcessImage(data []byte, mimeType string, config ImageProcessConfig) ([]byte, string, error) {
	// 如果没有启用任何处理，直接返回原始数据
	if !config.EnableCompression && config.TargetFormat == "" {
		return data, mimeType, nil
	}

	// 检查是否是支持的格式
	if !isSupportedImageFormat(mimeType, config.SupportedFormats) {
		return data, mimeType, nil
	}

	// 解码图片
	img, format, err := decodeImage(bytes.NewReader(data), mimeType)
	if err != nil {
		// 如果解码失败，返回原始数据
		return data, mimeType, nil
	}

	// 确定目标格式
	targetFormat := strings.ToLower(strings.TrimSpace(config.TargetFormat))
	if targetFormat == "" {
		targetFormat = format
	}

	// 检查目标格式是否在支持列表中
	if !isSupportedTargetFormat(targetFormat, config.SupportedFormats) {
		targetFormat = format
	}

	// 编码图片
	var buf bytes.Buffer
	newMimeType, err := encodeImage(&buf, img, targetFormat, config.CompressionQuality)
	if err != nil {
		// 败，返回原始数据
		return data, mimeType, nil
	}

	return buf.Bytes(), newMimeType, nil
}

// decodeImage 解码图片
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
		// 尝试自动检测
		img, format, err := image.Decode(r)
		return img, format, err
	}
}

// encodeImage 编码图片
func encodeImage(w io.Writer, img image.Image, format string, quality int) (string, error) {
	if quality <= 0 || quality > 100 {
		quality = 85
	}

	switch format {
	case "jpeg", "jpg":
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
		return "", fmt.Errorf("webp encode is not supported in current build")
	case "bmp":
		err := bmp.Encode(w, img)
		return "image/bmp", err
	case "tiff":
		err := tiff.Encode(w, img, nil)
		return "image/tiff", err
	default:
		return "", fmt.Errorf("unsupported format: %s", format)
	}
}

// isSupportedImageFormat 检查是否是支持的图片格式
func isSupportedImageFormat(mimeType string, supportedFormats []string) bool {
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))

	// 如果没有指定支持的格式，则支持所有常见图片格式
	if len(supportedFormats) == 0 {
		switch mimeType {
		case "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff":
			return true
		default:
			return false
		}
	}

	for _, format := range supportedFormats {
		format = strings.ToLower(strings.TrimSpace(format))
		// 支持 "jpeg" 或 "image/jpeg" 格式
		if format == mimeType || "image/"+format == mimeType {
			return true
		}
		// 特殊处理 jpg
		if format == "jpg" && mimeType == "image/jpeg" {
			return true
		}
		if format == "jpeg" && mimeType == "image/jpeg" {
			return true
		}
	}
	return false
}

// isSupportedTargetFormat 检查目标格式是否支持
func isSupportedTargetFormat(targetFormat string, supportedFormats []string) bool {
	targetFormat = strings.ToLower(strings.TrimSpace(targetFormat))

	// 如果没有指定支持的格式，则支持所有常见图片格式
	if len(supportedFormats) == 0 {
		switch targetFormat {
		case "jpeg", "jpg", "png", "gif", "webp", "bmp", "tiff":
			return true
		default:
			return false
		}
	}

	for _, format := range supportedFormats {
		format = strings.ToLower(strings.TrimSpace(format))
		if format == targetFormat {
			return true
		}
		// 特殊处理 jpg/jpeg
		if (format == "jpg" || format == "jpeg") && (targetFormat == "jpg" || targetFormat == "jpeg") {
			return true
		}
	}
	return false
}

// GetExtensionForMimeType 根据 MIME 类型获取文件扩展名
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
