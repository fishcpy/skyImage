import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { fetchGroups, deleteGroup, type GroupRecord } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminGroupsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });

  const removeMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      toast.success(t("admin.groups.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.groups.title")}</h1>
          <p className="text-muted-foreground">{t("admin.groups.description")}</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/admin/groups/new">{t("admin.groups.new")}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.groups.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!isLoading && !groups?.length && (
            <p className="text-sm text-muted-foreground">{t("admin.groups.empty")}</p>
          )}
          {groups?.map((group: GroupRecord) => (
            <div
              key={group.id}
              className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-sm font-medium">
                  {group.name} {group.isDefault ? `· ${t("admin.groups.default")}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.groups.maxCapacity", { value: (group.configs?.max_capacity ?? 0) / 1024 / 1024 })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to={`/dashboard/admin/groups/${group.id}`}>{t("admin.edit")}</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={removeMutation.isPending}>
                      {t("admin.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.groups.confirmDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("admin.groups.confirmDeleteDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => removeMutation.mutate(group.id)}
                      >
                        {t("admin.confirmDelete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
} 
