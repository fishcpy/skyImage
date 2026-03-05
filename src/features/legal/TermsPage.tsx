import { useQuery } from "@tanstack/react-query";
import { fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import DOMPurify from "dompurify";
import { useMemo } from "react";

export function TermsPage() {
  const { data: siteConfig, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
  });

  const termsContent = useMemo(() => {
    const content = siteConfig?.termsOfService || "";
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a', 'span'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  }, [siteConfig?.termsOfService]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!termsContent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">服务条款内容未设置</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">服务条款</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link to="/">返回首页</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: termsContent }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
