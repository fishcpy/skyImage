package files

import (
	stdhtml "html"
	"strings"
)

type ImageEmbedCodes struct {
	HTML             string
	Markdown         string
	MarkdownWithLink string
}

func BuildImageEmbedCodes(fileName string, publicURL string) ImageEmbedCodes {
	normalizedName := normalizeEmbedFileName(fileName)
	safeHTMLName := stdhtml.EscapeString(normalizedName)
	safeMarkdownName := escapeMarkdownAltText(normalizedName)
	safeHTMLURL := stdhtml.EscapeString(publicURL)

	return ImageEmbedCodes{
		HTML:             `<img src="` + safeHTMLURL + `" alt="` + safeHTMLName + `" />`,
		Markdown:         `![` + safeMarkdownName + `](` + publicURL + `)`,
		MarkdownWithLink: `[![` + safeMarkdownName + `](` + publicURL + `)](` + publicURL + `)`,
	}
}

func normalizeEmbedFileName(value string) string {
	value = strings.ReplaceAll(value, "\r", "")
	return strings.ReplaceAll(value, "\n", " ")
}

func escapeMarkdownAltText(value string) string {
	var builder strings.Builder
	for _, r := range value {
		switch r {
		case '\\', '[', ']':
			builder.WriteByte('\\')
			builder.WriteRune(r)
		default:
			builder.WriteRune(r)
		}
	}
	return builder.String()
}
