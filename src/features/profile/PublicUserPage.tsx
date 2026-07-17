import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

import { fetchPublicUserProfile, fetchSiteConfig, type PublicUserImage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SplashScreen } from "@/components/SplashScreen";
import { PublicTopNav } from "@/components/PublicTopNav";
import { normalizeFileUrl } from "@/lib/file-url";
import { useI18n } from "@/i18n";
import { NotFoundPage } from "@/features/misc/NotFoundPage";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function PublicUserPage() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    staleTime: 5 * 60 * 1000
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["public-user", id],
    queryFn: () => fetchPublicUserProfile(id, { limit: 60 }),
    enabled: Boolean(id),
    retry: false
  });

  const files = data?.images ?? [];

  useEffect(() => {
    Fancybox.bind("[data-fancybox='user-gallery']", {} as any);
    return () => {
      Fancybox.destroy();
    };
  }, [files]);

  if (isLoading) {
    return <SplashScreen message={t("userProfile.loading")} />;
  }

  if (isError || !data) {
    const status = (error as any)?.response?.status;
    if (status === 404 || !id) {
      return <NotFoundPage />;
    }
    return (
      <div className="min-h-screen bg-muted">
        <PublicTopNav title={siteConfig?.title} description="" compact />
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>{t("userProfile.loadFailed")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : t("userProfile.loadFailed")}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <PublicTopNav title={siteConfig?.title} description="" compact />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 rounded-xl">
            {data.avatarUrl ? (
              <AvatarImage src={data.avatarUrl} alt={data.name} />
            ) : null}
            <AvatarFallback className="rounded-xl text-lg">
              {getInitials(data.name || "?")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold">{data.name}</h1>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium">{t("userProfile.publicImages")}</h2>
          {files.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("userProfile.emptyTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t("userProfile.emptyDescription")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {files.map((file: PublicUserImage, index: number) => {
                const imageUrl = normalizeFileUrl(file.viewUrl);
                const thumbUrl = normalizeFileUrl(file.thumbnailUrl || file.viewUrl);
                return (
                  <a
                    key={`${imageUrl}-${index}`}
                    href={imageUrl}
                    data-fancybox="user-gallery"
                    className="group overflow-hidden rounded-lg border bg-card transition hover:shadow-md"
                  >
                    <img
                      src={thumbUrl}
                      alt=""
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
