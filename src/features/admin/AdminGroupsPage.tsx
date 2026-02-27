import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchGroups, deleteGroup, type GroupRecord } from "@/lib/api";

export function AdminGroupsPage() {
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });

  const removeMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      toast.success("已删除角色组");
      queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">角色组管理</h1>
          <p className="text-muted-foreground">管理上传限制与容量。</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/admin/groups/new">新增角色组</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>角色组列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">加载中...</p>}
          {!isLoading && !groups?.length && (
            <p className="text-sm text-muted-foreground">暂未配置角色组。</p>
          )}
          {groups?.map((group: GroupRecord) => (
            <div
              key={group.id}
              className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-medium">
                  {group.name} {group.isDefault ? "· 默认" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  最大容量 {(group.configs?.max_capacity ?? 0) / 1024 / 1024} MB
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to={`/dashboard/admin/groups/${group.id}`}>编辑</Link>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(group.id)}
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
