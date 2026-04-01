package files

import "testing"

func TestBuildImageEmbedCodesEscapesFileName(t *testing.T) {
	embeds := BuildImageEmbedCodes("bad\"name[1]\n.png", "https://example.com/file.png")

	wantHTML := `<img src="https://example.com/file.png" alt="bad&#34;name[1] .png" />`
	if embeds.HTML != wantHTML {
		t.Fatalf("unexpected HTML embed: %q", embeds.HTML)
	}

	wantMarkdown := "![bad\"name\\[1\\] .png](https://example.com/file.png)"
	if embeds.Markdown != wantMarkdown {
		t.Fatalf("unexpected Markdown embed: %q", embeds.Markdown)
	}

	wantMarkdownWithLink := "[![bad\"name\\[1\\] .png](https://example.com/file.png)](https://example.com/file.png)"
	if embeds.MarkdownWithLink != wantMarkdownWithLink {
		t.Fatalf("unexpected Markdown-with-link embed: %q", embeds.MarkdownWithLink)
	}
}
