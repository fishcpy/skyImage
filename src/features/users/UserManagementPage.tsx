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
import { useI18n } from "@/i18n";

export function UserManagementPage() {
  const { t } = useI18n();
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
          <h1 className="text-2xl font-semibold">{t("users.title")}</h1>
          <p className="text-muted-foreground">{t("users.description")}</p>
        </div>
        {isAdmin && (
          <Button asChild>
            <Link to="/dashboard/admin/users/new">{t("users.new")}</Link>
          </Button>
        )}
      </div>

      <Card>
          <CardHeader>
            <CardTitle>{t("users.listTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (
              <>
              {/* 桌面端表格 */}
              <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("users.table.user")}</TableHead>
                        <TableHead>{t("users.table.email")}</TableHead>
                        <TableHead>{t("users.table.group")}</TableHead>
                        <TableHead>{t("users.table.status")}</TableHead>
                        <TableHead>{t("users.table.role")}</TableHead>
                        <TableHead className="text-right">{t("users.table.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.group?.name ?? t("users.notGrouped")}</TableCell>
                        <TableCell>
                          <Badge variant={user.status === 1 ? "secondary" : "outline"}>
                            {user.status === 1 ? t("users.status.active") : t("users.status.disabled")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.isSuperAdmin ? (
                            <Badge variant="secondary">{t("users.roles.superAdmin")}</Badge>
                          ) : user.isAdmin ? (
                            <Badge>{t("users.roles.admin")}</Badge>
                          ) : (
                            <Badge variant="outline">{t("users.roles.user")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm">
                            <Link to={`/dashboard/admin/users/${user.id}`}>{t("users.edit")}</Link>
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
                          <Badge variant="secondary" className="flex-shrink-0">{t("users.roles.superAdmin")}</Badge>
                        ) : user.isAdmin ? (
                          <Badge className="flex-shrink-0">{t("users.roles.admin")}</Badge>
                        ) : (
                          <Badge variant="outline" className="flex-shrink-0">{t("users.roles.user")}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{t("users.table.group")}:</span>
                        <span>{user.group?.name ?? t("users.notGrouped")}</span>
                        <Badge variant={user.status === 1 ? "secondary" : "outline"} className="ml-auto">
                          {user.status === 1 ? t("users.status.active") : t("users.status.disabled")}
                        </Badge>
                      </div>
                    </div>
                    <Button asChild size="sm" className="w-full">
                      <Link to={`/dashboard/admin/users/${user.id}`}>{t("users.edit")}</Link>
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
