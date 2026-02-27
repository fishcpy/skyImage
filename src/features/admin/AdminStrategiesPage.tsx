import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchStrategies, deleteStrategy, type StrategyRecord } from "@/lib/api";

export function AdminStrategiesPage() {
  const queryClient = useQueryClient();
  const { data: strategies, isLoading } = useQuery({
    queryKey: ["admin", "strategies"],
    queryFn: fetchStrategies
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStrategy,
    onSuccess: () => {
      toast.success("策略已删除");
      queryClient.invalidateQueries({ queryKey: ["admin", "strategies"] });
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">储存策略</h1>
          <p className="text-muted-foreground">配置不同驱动、根路径与外链域名。</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/admin/strategies/new">新增策略</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>策略列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}
          {!isLoading && !strategies?.length && (
            <p className="text-sm text-muted-foreground">暂未配置策略。</p>
          )}
          {strategies?.map((strategy: StrategyRecord) => (
            <div
              key={strategy.id}
              className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{strategy.name}</p>
                <p className="text-xs text-muted-foreground">
                  {strategy.configs?.driver || "local"} ·{" "}
                  {strategy.configs?.url ||
                    strategy.configs?.base_url ||
                    strategy.configs?.baseUrl ||
                    "未配置外链"}
                </p>
                {strategy.groups?.length ? (
                  <p className="text-xs text-muted-foreground">
                    已授权角色组：
                    {strategy.groups.map((group) => group.name).join("，")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">未关联任何角色组</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to={`/dashboard/admin/strategies/${strategy.id}`}>编辑</Link>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(strategy.id)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
