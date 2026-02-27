import { useQuery } from "@tanstack/react-query";

import { fetchGalleryPublic, type FileRecord } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";
import { normalizeFileUrl } from "@/lib/file-url";

export function GalleryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["gallery", "public"],
    queryFn: () => fetchGalleryPublic({ limit: 60 })
  });

  if (isLoading) {
    return <SplashScreen message="正在加载画廊..." />;
  }

  const files = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">图片广场</h1>
        <p className="text-muted-foreground">这些是最近公开分享的图片。</p>
      </div>
      {files.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>还没有公开作品</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            在上传时选择“公开”即可将图片展示在这里。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {files.map((file: FileRecord) => (
            <a
              key={file.id}
              href={normalizeFileUrl(file.viewUrl || file.directUrl)}
              target="_blank"
              rel="noreferrer"
              className="group rounded-lg border bg-card transition hover:shadow-md"
            >
              <img
                src={normalizeFileUrl(file.viewUrl || file.directUrl)}
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
          ))}
        </div>
      )}
    </div>
  );
}
