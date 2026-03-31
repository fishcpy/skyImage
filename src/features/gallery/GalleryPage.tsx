import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

import { fetchGalleryPublic, type FileRecord } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";
import { normalizeFileUrl } from "@/lib/file-url";
import { useI18n } from "@/i18n";

export function GalleryPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["gallery", "public"],
    queryFn: () => fetchGalleryPublic({ limit: 60 })
  });

  const files = data ?? [];

  // 初始化 Fancybox
  useEffect(() => {
    Fancybox.bind("[data-fancybox='gallery']", {} as any);

    return () => {
      Fancybox.destroy();
    };
  }, [files]);

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((file: FileRecord) => {
            const imageUrl = normalizeFileUrl(file.viewUrl || file.directUrl);
            return (
              <a
                key={file.id}
                href={imageUrl}
                data-fancybox="gallery"
                data-caption={file.originalName}
                className="group rounded-lg border bg-card transition hover:shadow-md"
              >
                <img
                  src={imageUrl}
                  alt={file.originalName}
                  className="h-48 w-full rounded-t-lg object-cover"
                />
                <div className="p-3">
                  <p className="truncate text-sm font-medium group-hover:text-primary">
                    {file.originalName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
