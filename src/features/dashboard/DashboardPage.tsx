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
  const capacity = user?.capacity ?? 0;
  const used = user?.usedCapacity ?? 0;
  const hasCapacity = capacity > 0;
  const remaining = hasCapacity ? Math.max(capacity - used, 0) : 0;
  const usagePercent = hasCapacity ? Math.min((used / capacity) * 100, 100) : 0;

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

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

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
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>容量上限</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {hasCapacity ? formatBytes(capacity) : "未配置"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>已使用</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {formatBytes(used)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>剩余空间</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold">
              {hasCapacity ? formatBytes(remaining) : "未配置"}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasCapacity ? `剩余 ${formatPercent((remaining / capacity) * 100)}` : "请联系管理员配置容量"}
            </p>
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
      <Card>
        <CardHeader>
          <CardTitle>容量统计</CardTitle>
        </CardHeader>
        <CardContent>
          {hasCapacity ? (
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-center md:gap-10">
              <div className="relative h-28 w-28">
                <svg viewBox="0 0 120 120" className="h-full w-full">
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-muted/20"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="48"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(usagePercent / 100) * 2 * Math.PI * 48} ${2 * Math.PI * 48}`}
                    transform="rotate(-90 60 60)"
                    className="text-primary"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{formatPercent(usagePercent)}</p>
                    <p className="text-xs text-muted-foreground">已使用</p>
                  </div>
                </div>
              </div>
              <div className="grid w-full gap-4 text-sm md:w-auto md:grid-cols-3">
                <div className="space-y-1 text-center">
                  <p className="text-muted-foreground">容量上限</p>
                  <p className="text-xl font-semibold md:text-2xl">
                    {formatBytes(capacity)}
                  </p>
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-muted-foreground">已使用</p>
                  <p className="text-xl font-semibold md:text-2xl">
                    {formatBytes(used)}
                  </p>
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-muted-foreground">剩余空间</p>
                  <p className="text-xl font-semibold md:text-2xl">
                    {formatBytes(remaining)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              尚未配置容量上限，统计图将在配置后展示。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
