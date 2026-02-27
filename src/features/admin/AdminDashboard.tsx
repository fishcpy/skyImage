import { useQuery } from "@tanstack/react-query";
import { Activity, HardDrive, Users } from "lucide-react";

import { fetchAdminMetrics } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function AdminConsolePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: fetchAdminMetrics
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
    return <div>加载仪表盘数据...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">管理面板</h1>
        <p className="text-muted-foreground">
          监控用户、文件与系统配置状态。
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="活跃用户"
          value={data?.userCount ?? 0}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="文件数量"
          value={data?.fileCount ?? 0}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="存储使用"
          value={formatBytes(data?.storageUsed ?? 0)}
          icon={<HardDrive className="h-4 w-4 text-muted-foreground" />}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>最近上传</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.recentUploads?.length ? (
            data.recentUploads.map((file: any) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{file.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.mimeType} · {new Date(file.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={file.visibility === "public" ? "default" : "secondary"}
                >
                  {file.visibility === "public" ? "公开" : "私有"}
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">暂无上传记录</p>
          )}
        </CardContent>
      </Card>
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
