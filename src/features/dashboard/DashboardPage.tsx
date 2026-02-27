import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSiteConfig } from "@/lib/api";

const DEFAULT_DISABLED_NOTICE = "账户已被封禁，请联系管理员恢复访问。";

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const isDisabled = user?.status === 0;
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });
  const disabledNotice =
    siteConfig?.accountDisabledNotice?.trim() || DEFAULT_DISABLED_NOTICE;

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return `${value.toFixed(2)} ${units[idx]}`;
  };

  return (
    <div className="space-y-6">
      <div>
        {isDisabled && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <p className="font-semibold text-destructive">您的账户已被封禁</p>
            <p className="text-sm text-destructive/80">{disabledNotice}</p>
          </div>
        )}
        <h1 className="text-2xl font-semibold">欢迎回来，{user?.name ?? "用户"}</h1>
        <p className="text-muted-foreground">
          快速查看你的容量占用、最近上传和系统通知。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>容量上限</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {user?.capacity ? formatBytes(user.capacity) : "不限"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>已使用</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {formatBytes(user?.usedCapacity ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>今日状态</CardTitle>
          </CardHeader>
          <CardContent>
            {isDisabled ? (
              <p className="text-sm text-destructive">{disabledNotice}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                一切运行正常，快去上传你的作品吧。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
