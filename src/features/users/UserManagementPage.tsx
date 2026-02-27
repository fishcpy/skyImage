import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { fetchUsers } from "@/lib/api";
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
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.isAdmin;

  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">用户管理</h1>
          <p className="text-muted-foreground">
            统一查看用户状态、角色和所属角色组。
          </p>
        </div>
        {isAdmin && (
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
                    {users?.map((user: any) => (
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
                        <TableCell className="text-right">
                          <Button variant="link" size="sm" asChild>
                            <Link to={`/dashboard/admin/users/${user.id}`}>编辑</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 移动端卡片列表 */}
              <div className="md:hidden space-y-3">
                {users?.map((user: any) => (
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
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link to={`/dashboard/admin/users/${user.id}`}>编辑</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
