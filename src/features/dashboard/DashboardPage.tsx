import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchUserTrends } from "@/lib/api";
import { UserTrendChart } from "./components/UserTrendChart";
import { useI18n } from "@/i18n";

export function DashboardPage() {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const capacity = user?.capacity ?? 0;
  const used = user?.usedCapacity ?? 0;
  const hasCapacity = capacity > 0;
  const remaining = hasCapacity ? Math.max(capacity - used, 0) : 0;
  const usagePercent = hasCapacity ? Math.min((used / capacity) * 100, 100) : 0;

  const { data: trendsData } = useQuery({
    queryKey: ["user-trends"],
    queryFn: () => fetchUserTrends(90),
    staleTime: 5 * 60 * 1000
  });

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
        <h1 className="text-2xl font-semibold">
          {t("dashboard.welcome", { name: user?.name ?? t("dashboard.defaultUser") })}
        </h1>
        <p className="text-muted-foreground">
          {t("dashboard.subtitle")}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.capacityLimit")}</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {hasCapacity ? formatBytes(capacity) : t("common.notConfigured")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.used")}</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {formatBytes(used)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.remaining")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold">
              {hasCapacity ? formatBytes(remaining) : t("common.notConfigured")}
            </div>
            <p className="text-xs text-muted-foreground">
              {hasCapacity
                ? t("dashboard.remainingPercent", { percent: formatPercent((remaining / capacity) * 100) })
                : t("dashboard.contactAdmin")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.todayStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.todayStatusDescription")}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.capacityStats")}</CardTitle>
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
                    <p className="text-xs text-muted-foreground">{t("dashboard.used")}</p>
                  </div>
                </div>
              </div>
              <div className="grid w-full gap-4 text-sm md:w-auto md:grid-cols-3">
                <div className="space-y-1 text-center">
                  <p className="text-muted-foreground">{t("dashboard.capacityLimit")}</p>
                  <p className="text-xl font-semibold md:text-2xl">
                    {formatBytes(capacity)}
                  </p>
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-muted-foreground">{t("dashboard.used")}</p>
                  <p className="text-xl font-semibold md:text-2xl">
                    {formatBytes(used)}
                  </p>
                </div>
                <div className="space-y-1 text-center">
                  <p className="text-muted-foreground">{t("dashboard.remaining")}</p>
                  <p className="text-xl font-semibold md:text-2xl">
                    {formatBytes(remaining)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("dashboard.notConfiguredHint")}
            </p>
          )}
        </CardContent>
      </Card>
      {trendsData && trendsData.length > 0 && (
        <UserTrendChart data={trendsData} />
      )}
    </div>
  );
}
