import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  assignUserGroup,
  fetchGroups,
  fetchUserDetail,
  toggleUserAdmin,
  updateUserStatus
} from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/state/auth";

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

export function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const userId = Number(id);

  const { data: user, refetch } = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => fetchUserDetail(userId),
    enabled: Number.isFinite(userId)
  });
  const { data: groups } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });
  const [groupId, setGroupId] = useState<number | "none">("none");

  useEffect(() => {
    if (user) {
      setGroupId(user.groupId ?? "none");
    }
  }, [user]);

  const statusMutation = useMutation({
    mutationFn: (status: number) => updateUserStatus(userId, status),
    onSuccess: () => {
      toast.success("状态已更新");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      refetch();
      
      // 如果修改的是当前用户，刷新当前用户信息
      if (currentUser && userId === currentUser.id) {
        useAuthStore.getState().refreshUser().catch((err) => {
          console.error('[AdminUserDetail] Failed to refresh current user:', err);
        });
      }
    },
    onError: (error) => toast.error(error.message)
  });

  const adminMutation = useMutation({
    mutationFn: (admin: boolean) => toggleUserAdmin(userId, admin),
    onSuccess: () => {
      toast.success("角色已更新");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      refetch();
      
      // 如果修改的是当前用户，刷新当前用户信息
      if (currentUser && userId === currentUser.id) {
        useAuthStore.getState().refreshUser().catch((err) => {
          console.error('[AdminUserDetail] Failed to refresh current user:', err);
        });
      }
    },
    onError: (error) => toast.error(error.message)
  });

  const groupMutation = useMutation({
    mutationFn: (value: number | null) => assignUserGroup(userId, value),
    onSuccess: () => {
      toast.success("角色组已更新");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      refetch();
    }
  });

  const handleGroupChange = (value: string) => {
    const next = value === "none" ? null : Number(value);
    setGroupId(value === "none" ? "none" : Number(value));
    groupMutation.mutate(next);
  };

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <Link to="/dashboard/admin/users" className="text-primary">
            用户管理
          </Link>{" "}
          / 用户详情
        </p>
        <p className="text-sm text-muted-foreground">正在加载...</p>
      </div>
    );
  }

  const immutable = user.isSuperAdmin;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link to="/dashboard/admin/users" className="text-primary">
          用户管理
        </Link>{" "}
        / {user.name}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>昵称：{user.name}</p>
          <p>邮箱：{user.email}</p>
          <p>角色：{user.isSuperAdmin ? "超级管理员" : user.isAdmin ? "管理员" : "普通用户"}</p>
          <p>状态：{user.status === 1 ? "正常" : "已禁用"}</p>
          <p>
            容量使用：{formatBytes(user.usedCapacity ?? 0)} /{" "}
            {user.capacity && user.capacity > 0 ? formatBytes(user.capacity) : "未配置"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>角色组</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={groupId === "none" ? "none" : String(groupId)}
            onValueChange={handleGroupChange}
            disabled={immutable}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择角色组" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未分配</SelectItem>
              {groups?.map((group) => (
                <SelectItem key={group.id} value={String(group.id)}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            变更后立即生效，上传策略将根据角色组可用策略自动筛选。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>权限控制</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {!immutable && (
            <Button
              variant="outline"
              onClick={() => statusMutation.mutate(user.status === 1 ? 0 : 1)}
              disabled={statusMutation.isPending}
            >
              {user.status === 1 ? "禁用账户" : "启用账户"}
            </Button>
          )}
          {!user.isSuperAdmin && (
            <Button
              variant="ghost"
              onClick={() => adminMutation.mutate(!user.isAdmin)}
              disabled={adminMutation.isPending}
            >
              {user.isAdmin ? "降级为普通用户" : "升级为管理员"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate("/dashboard/admin/users")}>
            返回列表
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
