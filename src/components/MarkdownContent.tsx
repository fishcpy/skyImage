import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { cn } from "@/lib/utils";

const ALLOWED_TAGS = [
  "p",
  "div",
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "br",
  "a",
  "span",
  "blockquote",
  "pre",
  "code",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "del",
  "sup",
  "sub"
];

const ALLOWED_ATTR = ["class", "href", "target", "rel", "src", "alt", "title", "width", "height"];

// Only allow safe URL schemes for href/src.
const SAFE_URI = /^(?:(?:https?|mailto):|\/|#)/i;

function looksLikeHtml(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // Prefer markdown for ordinary text; only treat as HTML when it clearly starts as markup.
  if (/^<[a-zA-Z!/?]/.test(trimmed)) return true;
  return false;
}

function configureDomPurify() {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof HTMLElement) {
      if (node.tagName === "A") {
        const href = node.getAttribute("href") || "";
        if (href && !SAFE_URI.test(href)) {
          node.removeAttribute("href");
        }
        node.setAttribute("rel", "noopener noreferrer nofollow");
        if (href.startsWith("http://") || href.startsWith("https://")) {
          node.setAttribute("target", "_blank");
        }
      }
      if (node.tagName === "IMG") {
        const src = node.getAttribute("src") || "";
        if (src && !SAFE_URI.test(src) && !src.startsWith("data:image/")) {
          node.removeAttribute("src");
        }
      }
    }
  });
}

let hooksInstalled = false;

function renderToSafeHtml(content: string): string {
  if (!hooksInstalled && typeof window !== "undefined") {
    configureDomPurify();
    hooksInstalled = true;
  }
  const raw = content || "";
  let html = raw;
  if (!looksLikeHtml(raw)) {
    marked.setOptions({ gfm: true, breaks: true });
    html = marked.parse(raw, { async: false }) as string;
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|\/|#|data:image\/)/i
  });
}

type MarkdownContentProps = {
  content: string;
  className?: string;
};

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const html = useMemo(() => renderToSafeHtml(content), [content]);
  if (!html) return null;
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert break-words",
        "prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2",
        "prose-pre:my-2 prose-blockquote:my-2 prose-li:my-0.5",
        "[&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
