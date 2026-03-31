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
import { fetchStrategies, deleteStrategy, type StrategyRecord } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminStrategiesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: strategies, isLoading } = useQuery({
    queryKey: ["admin", "strategies"],
    queryFn: fetchStrategies
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStrategy,
    onSuccess: () => {
      toast.success(t("admin.strategies.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "strategies"] });
    },
    onError: (error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.strategies.title")}</h1>
          <p className="text-muted-foreground">{t("admin.strategies.description")}</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/admin/strategies/new">{t("admin.strategies.new")}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.strategies.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!isLoading && !strategies?.length && (
            <p className="text-sm text-muted-foreground">{t("admin.strategies.empty")}</p>
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
                    t("admin.strategies.noPublicUrl")}
                </p>
                {strategy.groups?.length ? (
                  <p className="text-xs text-muted-foreground">
                    {t("admin.strategies.authorizedGroups")}
                    {strategy.groups.map((group) => group.name).join("，")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("admin.strategies.noGroups")}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to={`/dashboard/admin/strategies/${strategy.id}`}>{t("admin.edit")}</Link>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={deleteMutation.isPending}>
                      {t("admin.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.strategies.confirmDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("admin.strategies.confirmDeleteDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deleteMutation.mutate(strategy.id)}
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
