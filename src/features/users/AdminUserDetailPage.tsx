import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  assignUserGroup,
  deleteUserAccount,
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
  const isAdmin = currentUser?.isAdmin;

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

  const deleteMutation = useMutation({
    mutationFn: () => deleteUserAccount(userId),
    onSuccess: () => {
      toast.success("用户已删除");
      queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/dashboard/admin/users");
    },
    onError: (error) => toast.error(error.message)
  });

  const handleGroupChange = (value: string) => {
    const next = value === "none" ? null : Number(value);
    setGroupId(value === "none" ? "none" : Number(value));
    groupMutation.mutate(next);
  };

  const handleDelete = () => {
    if (window.confirm("删除后该用户及其文件将被清理，确定继续吗？")) {
      deleteMutation.mutate();
    }
  };

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <Link to="/dashboard/admin/users" className="text-primary">
            用户管理
          </Link>{" "}
          / 编辑用户
        </p>
        <p className="text-sm text-muted-foreground">正在加载...</p>
      </div>
    );
  }

  const isSuperAdmin = user.isSuperAdmin;
  const canModify = isAdmin && !isSuperAdmin;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <Link to="/dashboard/admin/users" className="text-primary">
            用户管理
          </Link>{" "}
          / {user.name}
        </p>
        {isSuperAdmin && (
          <Badge variant="secondary">受保护账户</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">昵称</p>
              <p className="font-medium">{user.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">邮箱</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">角色</p>
              <div>
                {user.isSuperAdmin ? (
                  <Badge variant="secondary">超级管理员</Badge>
                ) : user.isAdmin ? (
                  <Badge>管理员</Badge>
                ) : (
                  <Badge variant="outline">普通用户</Badge>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">状态</p>
              <div>
                <Badge variant={user.status === 1 ? "secondary" : "outline"}>
                  {user.status === 1 ? "正常" : "已禁用"}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">容量使用</p>
              <p className="font-medium">{formatBytes(user.usedCapacity ?? 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">容量上限</p>
              <p className="font-medium">
                {user.capacity && user.capacity > 0 ? formatBytes(user.capacity) : "未配置"}
              </p>
            </div>
          </div>
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
            disabled={!isAdmin}
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
        <CardContent>
          <div className="space-y-4">
            {/* 账户状态 */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">账户状态</p>
                <p className="text-sm text-muted-foreground">
                  {user.status === 1 ? "账户正常，可以登录和使用" : "账户已禁用，无法登录"}
                </p>
              </div>
              {canModify && (
                <Button
                  variant={user.status === 1 ? "outline" : "default"}
                  onClick={() => statusMutation.mutate(user.status === 1 ? 0 : 1)}
                  disabled={statusMutation.isPending}
                >
                  {user.status === 1 ? "禁用" : "启用"}
                </Button>
              )}
              {!canModify && (
                <Badge variant="secondary">不可修改</Badge>
              )}
            </div>

            {/* 管理员权限 */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">管理员权限</p>
                <p className="text-sm text-muted-foreground">
                  {user.isAdmin ? "拥有管理后台访问权限" : "普通用户，无管理权限"}
                </p>
              </div>
              {canModify && (
                <Button
                  variant={user.isAdmin ? "outline" : "default"}
                  onClick={() => adminMutation.mutate(!user.isAdmin)}
                  disabled={adminMutation.isPending}
                >
                  {user.isAdmin ? "降级" : "升级"}
                </Button>
              )}
              {isSuperAdmin && (
                <Badge variant="secondary">超级管理员</Badge>
              )}
            </div>

            {/* 删除账户 */}
            {canModify && (
              <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/50 bg-destructive/5">
                <div>
                  <p className="font-medium text-destructive">删除账户</p>
                  <p className="text-sm text-muted-foreground">
                    删除后该用户及其所有文件将被永久清理，此操作不可恢复
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  删除
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t">
            <Button variant="secondary" onClick={() => navigate("/dashboard/admin/users")}>
              返回列表
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
