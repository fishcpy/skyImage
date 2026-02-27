import { useQuery } from "@tanstack/react-query";

import { fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";

export function AboutPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });

  if (isLoading) {
    return <SplashScreen message="加载站点信息..." />;
  }

  const title = data?.title || "skyImage";
  const description = data?.description || "云端图床";
  const about = data?.about || "功能重构中，即将上线更多特性。";
  const version = data?.version || "未知版本";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">关于 {title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>当前版本</CardTitle>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{version}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>项目简介</CardTitle>
        </CardHeader>
        <CardContent className="prose max-w-none text-sm text-muted-foreground">
          {about}
        </CardContent>
      </Card>
    </div>
  );
}
