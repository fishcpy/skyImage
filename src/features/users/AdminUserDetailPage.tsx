import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
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
import { useI18n } from "@/i18n";

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
  const { t } = useI18n();
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
      toast.success(t("users.updated.status"));
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
      toast.success(t("users.updated.role"));
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
      toast.success(t("users.updated.group"));
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
      toast.success(t("users.deleted"));
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

  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          <Link to="/dashboard/admin/users" className="text-primary">
            {t("users.title")}
          </Link>{" "}
          / {t("users.detail.edit")}
        </p>
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
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
            {t("users.title")}
          </Link>{" "}
          / {user.name}
        </p>
        {isSuperAdmin && (
          <Badge variant="secondary">{t("users.detail.protected")}</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.detail.basic")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">{t("users.fields.name")}</p>
              <p className="font-medium">{user.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("users.fields.email")}</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("users.fields.role")}</p>
              <div>
                {user.isSuperAdmin ? (
                  <Badge variant="secondary">{t("users.roles.superAdmin")}</Badge>
                ) : user.isAdmin ? (
                  <Badge>{t("users.roles.admin")}</Badge>
                ) : (
                  <Badge variant="outline">{t("users.roles.user")}</Badge>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("users.table.status")}</p>
              <div>
                <Badge variant={user.status === 1 ? "secondary" : "outline"}>
                  {user.status === 1 ? t("users.status.active") : t("users.status.disabled")}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("users.capacity.used")}</p>
              <p className="font-medium">{formatBytes(user.usedCapacity ?? 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("users.capacity.limit")}</p>
              <p className="font-medium">
                {user.capacity && user.capacity > 0 ? formatBytes(user.capacity) : t("common.notConfigured")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.detail.group")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={groupId === "none" ? "none" : String(groupId)}
            onValueChange={handleGroupChange}
            disabled={!isAdmin}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("users.fields.roleSelect")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("users.detail.groupUnassigned")}</SelectItem>
              {groups?.map((group) => (
                <SelectItem key={group.id} value={String(group.id)}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("users.detail.groupHint")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("users.detail.permissions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 账户状态 */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">{t("users.detail.accountStatus")}</p>
                <p className="text-sm text-muted-foreground">
                  {user.status === 1
                    ? t("users.detail.accountStatusActive")
                    : t("users.detail.accountStatusDisabled")}
                </p>
              </div>
              {canModify && (
                <Button
                  variant={user.status === 1 ? "outline" : "default"}
                  onClick={() => statusMutation.mutate(user.status === 1 ? 0 : 1)}
                  disabled={statusMutation.isPending}
                >
                  {user.status === 1 ? t("users.detail.disable") : t("users.detail.enable")}
                </Button>
              )}
              {!canModify && (
                <Badge variant="secondary">{t("users.detail.notModifiable")}</Badge>
              )}
            </div>

            {/* 管理员权限 */}
            <div className="flex items-center justify-between p-4 rounded-lg border">
              <div>
                <p className="font-medium">{t("users.detail.adminAccess")}</p>
                <p className="text-sm text-muted-foreground">
                  {user.isAdmin
                    ? t("users.detail.adminAccessEnabled")
                    : t("users.detail.adminAccessDisabled")}
                </p>
              </div>
              {canModify && (
                <Button
                  variant={user.isAdmin ? "outline" : "default"}
                  onClick={() => adminMutation.mutate(!user.isAdmin)}
                  disabled={adminMutation.isPending}
                >
                  {user.isAdmin ? t("users.detail.demote") : t("users.detail.promote")}
                </Button>
              )}
              {isSuperAdmin && (
                <Badge variant="secondary">{t("users.roles.superAdmin")}</Badge>
              )}
            </div>

            {/* 删除账户 */}
            {canModify && (
              <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/50 bg-destructive/5">
                <div>
                  <p className="font-medium text-destructive">{t("users.detail.deleteAccount")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("users.detail.deleteHint")}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={deleteMutation.isPending}>
                      {t("admin.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("users.detail.confirmDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("users.detail.confirmDeleteDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMutation.mutate()}
                      >
                        {t("admin.confirmDelete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t">
            <Button variant="secondary" onClick={() => navigate("/dashboard/admin/users")}>
              {t("users.detail.backToList")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
