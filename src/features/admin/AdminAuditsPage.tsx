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
import { deleteAuditProfile, fetchAuditProfiles, type AuditProfileRecord } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminAuditsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: audits, isLoading } = useQuery({
    queryKey: ["admin", "audits"],
    queryFn: fetchAuditProfiles
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAuditProfile,
    onSuccess: () => {
      toast.success(t("admin.audits.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.audits.title")}</h1>
          <p className="text-muted-foreground">{t("admin.audits.description")}</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/admin/audits/new">{t("admin.audits.new")}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.audits.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!isLoading && !audits?.length && (
            <p className="text-sm text-muted-foreground">{t("admin.audits.empty")}</p>
          )}
          {audits?.map((audit: AuditProfileRecord) => (
            <div
              key={audit.id}
              className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{audit.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.audits.providerLabel")} UAPI NSFW
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("admin.audits.concurrencyLabel", {
                    value: audit.configs?.max_concurrency || 1
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {audit.configs?.api_key
                    ? t("admin.audits.usingApiKey")
                    : t("admin.audits.usingFreeCredits")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to={`/dashboard/admin/audits/${audit.id}`}>{t("admin.edit")}</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={deleteMutation.isPending}>
                      {t("admin.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.audits.confirmDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("admin.audits.confirmDeleteDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMutation.mutate(audit.id)}
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
