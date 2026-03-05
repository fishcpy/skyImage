import { useQuery } from "@tanstack/react-query";
import { fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function PrivacyPage() {
  const { data: siteConfig, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
  });

  const privacyContent = siteConfig?.privacyPolicy || "";

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

  if (!privacyContent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Card className="w-full max-w-4xl mx-4">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">隐私政策内容未设置</p>
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
              <CardTitle className="text-2xl">隐私政策</CardTitle>
              <Button asChild variant="outline" size="sm">
                <Link to="/">返回首页</Link>
              </Button>
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
  );
}
