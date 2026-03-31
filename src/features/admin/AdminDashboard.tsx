import { useQuery } from "@tanstack/react-query";
import { Activity, HardDrive, Users } from "lucide-react";

import { fetchAdminMetrics, fetchAdminTrends } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendChart } from "./components/TrendChart";
import { useI18n } from "@/i18n";

export function AdminConsolePage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: fetchAdminMetrics
  });

  const { data: trendsData } = useQuery({
    queryKey: ["admin-trends"],
    queryFn: () => fetchAdminTrends(90),
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

  if (isLoading) {
    return <div>{t("admin.loadingDashboard")}</div>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.consoleTitle")}</h1>
        <p className="text-muted-foreground">
          {t("admin.consoleDescription")}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title={t("admin.activeUsers")}
          value={data?.userCount ?? 0}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t("admin.fileCount")}
          value={data?.fileCount ?? 0}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title={t("admin.storageUsage")}
          value={formatBytes(data?.storageUsed ?? 0)}
          icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
        />
      </div>
      {trendsData && trendsData.length > 0 && (
        <TrendChart data={trendsData} />
      )}
    </div>
  );
}

type StatCardProps = {
  title: string;
  value: string | number;
  icon: React.ReactNode;
};

function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
