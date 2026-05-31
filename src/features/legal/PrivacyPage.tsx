import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DOMPurify from "dompurify";
import { useMemo } from "react";
import { useI18n } from "@/i18n";
import { PublicTopNav } from "@/components/PublicTopNav";

export function PrivacyPage() {
  const { t } = useI18n();
  const { data: siteConfig, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
  });
  const siteName = siteConfig?.title;

  const privacyContent = useMemo(() => {
    const content = siteConfig?.privacyPolicy || "";
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'div', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a', 'span'],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  }, [siteConfig?.privacyPolicy]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted">
        <PublicTopNav title={siteName} description="" compact />
        <div className="flex min-h-[calc(100svh-88px)] items-center justify-center px-4 pb-8">
          <Card className="w-full max-w-4xl mx-4">
            <CardContent className="pt-6">
              <div className="flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!privacyContent) {
    return (
      <div className="min-h-screen bg-muted">
        <PublicTopNav title={siteName} description="" compact />
        <div className="flex min-h-[calc(100svh-88px)] items-center justify-center px-4 pb-8">
          <Card className="w-full max-w-4xl mx-4">
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">{t("legal.notConfiguredPrivacy")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <PublicTopNav title={siteName} description={siteConfig?.description || ""} compact />
      <div className="py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">{t("legal.privacy")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: privacyContent }}
            />
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
