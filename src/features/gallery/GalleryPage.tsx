import { useQuery } from "@tanstack/react-query";

import { fetchGalleryPublic } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";
import { ImageGrid } from "@/features/files/components/ImageGrid";
import { useI18n } from "@/i18n";

export function GalleryPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["gallery", "public"],
    queryFn: () => fetchGalleryPublic({ limit: 60 })
  });

  const files = data ?? [];

  if (isLoading) {
    return <SplashScreen message={t("gallery.loading")} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("gallery.title")}</h1>
        <p className="text-muted-foreground">{t("gallery.description")}</p>
      </div>
      {files.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("gallery.emptyTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("gallery.emptyDescription")}
          </CardContent>
        </Card>
      ) : (
        <ImageGrid files={files} isLoading={false} showOwner enableSelection={false} />
      )}
    </div>
  );
}
