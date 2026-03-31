import { useQuery } from "@tanstack/react-query";

import { fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";
import { useI18n } from "@/i18n";

export function AboutPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });

  if (isLoading) {
    return <SplashScreen message={t("about.loading")} />;
  }

  const title = data?.title || "skyImage";
  const description = data?.description || t("about.defaultDescription");
  const about = data?.about || t("about.defaultContent");
  const aboutTitle = data?.aboutTitle?.trim() || t("about.defaultTitle");
  const version = data?.version || t("about.unknownVersion");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("about.title", { title })}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("about.version")}</CardTitle>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{version}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{aboutTitle}</CardTitle>
        </CardHeader>
        <CardContent className="prose max-w-none text-sm text-muted-foreground">
          {about}
        </CardContent>
      </Card>
    </div>
  );
}
