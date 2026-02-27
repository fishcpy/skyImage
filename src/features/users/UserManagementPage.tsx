import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deleteUserAccount,
  fetchUsers,
  toggleUserAdmin,
  updateUserStatus
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/state/auth";

export function UserManagementPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);
  const isSuperAdmin = currentUser?.isSuperAdmin;

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: number }) =>
      updateUserStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("状态已更新");
      
      // 如果修改的是当前用户，刷新当前用户信息
      if (currentUser && variables.id === currentUser.id) {
        useAuthStore.getState().refreshUser().catch((err) => {
          console.error('[UserManagement] Failed to refresh current user:', err);
        });
      }
    },
    onError: (error) => toast.error(error.message)
  });

  const adminMutation = useMutation({
    mutationFn: ({ id, admin }: { id: number; admin: boolean }) =>
      toggleUserAdmin(id, admin),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("角色已更新");
      
      // 如果修改的是当前用户，刷新当前用户信息
      if (currentUser && variables.id === currentUser.id) {
        useAuthStore.getState().refreshUser().catch((err) => {
          console.error('[UserManagement] Failed to refresh current user:', err);
        });
      }
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUserAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("用户已删除");
    },
    onError: (error) => toast.error(error.message)
  });

  const handleDelete = (id: number) => {
    if (
      window.confirm("删除后该用户及其文件将被清理，确定继续吗？")
    ) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">用户管理</h1>
          <p className="text-muted-foreground">
            统一查看用户状态、角色和所属角色组。
          </p>
        </div>
        {isSuperAdmin && (
          <Button asChild>
            <Link to="/dashboard/admin/users/new">新增用户</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>全部用户</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : (
            <>
              {/* 桌面端表格 */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>角色组</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user: any) => {
                      const manageable = Boolean(isSuperAdmin && !user.isSuperAdmin);
                      return (
                        <TableRow key={user.id}>
                          <TableCell>{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.group?.name ?? "未分组"}</TableCell>
                          <TableCell>
                            <Badge variant={user.status === 1 ? "secondary" : "outline"}>
                              {user.status === 1 ? "正常" : "禁用"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {user.isSuperAdmin ? (
                              <Badge variant="secondary">超级管理员</Badge>
                            ) : user.isAdmin ? (
                              <Badge>管理员</Badge>
                            ) : (
                              <Badge variant="outline">普通用户</Badge>
                            )}
                          </TableCell>
                          <TableCell className="space-x-2 text-right">
                            <Button variant="link" size="sm" asChild>
                              <Link to={`/dashboard/admin/users/${user.id}`}>详情</Link>
                            </Button>
                            {manageable && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: user.id,
                                      status: user.status === 1 ? 0 : 1
                                    })
                                  }
                                  disabled={statusMutation.isPending}
                                >
                                  {user.status === 1 ? "禁用" : "解禁"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    adminMutation.mutate({
                                      id: user.id,
                                      admin: !user.isAdmin
                                    })
                                  }
                                  disabled={adminMutation.isPending}
                                >
                                  {user.isAdmin ? "降级" : "升级"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(user.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  删除
                                </Button>
                              </>
                            )}
                            {!manageable && (
                              <span className="text-xs text-muted-foreground">
                                {user.isSuperAdmin ? "受保护账户" : "仅超级管理员可操作"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* 移动端卡片列表 */}
              <div className="md:hidden space-y-3">
                {users?.map((user: any) => {
                  const manageable = Boolean(isSuperAdmin && !user.isSuperAdmin);
                  return (
                    <div
                      key={user.id}
                      className="rounded-lg border bg-card p-4 space-y-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{user.name}</p>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          </div>
                          {user.isSuperAdmin ? (
                            <Badge variant="secondary" className="flex-shrink-0">超级管理员</Badge>
                          ) : user.isAdmin ? (
                            <Badge className="flex-shrink-0">管理员</Badge>
                          ) : (
                            <Badge variant="outline" className="flex-shrink-0">普通用户</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">角色组:</span>
                          <span>{user.group?.name ?? "未分组"}</span>
                          <Badge variant={user.status === 1 ? "secondary" : "outline"} className="ml-auto">
                            {user.status === 1 ? "正常" : "禁用"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="flex-1" asChild>
                          <Link to={`/dashboard/admin/users/${user.id}`}>详情</Link>
                        </Button>
                        {manageable && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() =>
                                statusMutation.mutate({
                                  id: user.id,
                                  status: user.status === 1 ? 0 : 1
                                })
                              }
                              disabled={statusMutation.isPending}
                            >
                              {user.status === 1 ? "禁用" : "解禁"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() =>
                                adminMutation.mutate({
                                  id: user.id,
                                  admin: !user.isAdmin
                                })
                              }
                              disabled={adminMutation.isPending}
                            >
                              {user.isAdmin ? "降级" : "升级"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="w-full"
                              onClick={() => handleDelete(user.id)}
                              disabled={deleteMutation.isPending}
                            >
                              删除
                            </Button>
                          </>
                        )}
                        {!manageable && (
                          <p className="w-full text-xs text-center text-muted-foreground py-2">
                            {user.isSuperAdmin ? "受保护账户" : "仅超级管理员可操作"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
