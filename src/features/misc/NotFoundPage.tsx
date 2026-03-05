import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSiteConfig } from "@/lib/api";
import DOMPurify from "dompurify";

export function NotFoundPage() {
  // 从 localStorage 获取缓存的配置
  const getCachedConfig = () => {
    try {
      const cached = localStorage.getItem("skyimage-site-config");
      return cached ? JSON.parse(cached) : undefined;
    } catch {
      return undefined;
    }
  };

  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    initialData: getCachedConfig,
    staleTime: 5 * 60 * 1000
  });

  const notFoundMode = siteConfig?.notFoundMode || "template";
  const siteTitle = siteConfig?.title || "skyImage";
  const notFoundHeading = siteConfig?.notFoundHeading?.trim() || "404";
  const notFoundText = siteConfig?.notFoundText?.trim();
  
  const sanitizedNotFoundHtml = useMemo(() => {
    const html = siteConfig?.notFoundHtml?.trim() || "";
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a', 'span'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  }, [siteConfig?.notFoundHtml]);

  // 设置页面标题为站点标题
  useEffect(() => {
    const originalTitle = document.title;
    document.title = siteTitle;
    return () => {
      document.title = originalTitle;
    };
  }, [siteTitle]);

  // 如果选择自定义 HTML 模式
  if (notFoundMode === "html" && sanitizedNotFoundHtml) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div dangerouslySetInnerHTML={{ __html: sanitizedNotFoundHtml }} />
      </div>
    );
  }

  // 默认模板模式
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div>
        <p className="text-6xl font-bold text-primary">{notFoundHeading}</p>
        {notFoundText ? (
          <div className="mt-4 whitespace-pre-wrap text-muted-foreground">
            {notFoundText}
          </div>
        ) : (
          <>
            <p className="mt-2 text-lg font-semibold">页面不存在</p>
            <p className="text-sm text-muted-foreground">
              页面可能已经被删除或地址输入有误。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
