import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteApiToken, fetchApiTokens } from "@/lib/api";
import { Trash2, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n";

export function ApiTokensPage() {
  const { t } = useI18n();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: fetchApiTokens,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success(t("apiTokens.deleted"));
      setDeleteId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const tokenItems = useMemo(() => {
    return tokens.map((token) => {
      const expiresAt = new Date(token.expiresAt);
      const neverExpire = expiresAt.getUTCFullYear() >= 9999;
      const expired = !neverExpire && expiresAt < new Date();
      return {
        ...token,
        neverExpire,
        expired,
      };
    });
  }, [tokens]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("apiTokens.title")}</h1>
          <p className="text-muted-foreground">{t("apiTokens.description")}</p>
        </div>
        <Button onClick={() => navigate("/dashboard/api-tokens/new")}>
          <Plus className="mr-2 h-4 w-4" />
          {t("apiTokens.new")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("apiTokens.list")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : tokenItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("apiTokens.empty")}</p>
          ) : (
            <div className="space-y-3">
              {tokenItems.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono">{token.tokenMasked ?? token.token}</code>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{t("apiTokens.createdAt", { value: format(new Date(token.createdAt), "yyyy-MM-dd HH:mm") })}</span>
                      <span>•</span>
                      <span>
                        {t("apiTokens.expiresAt", { value: token.neverExpire ? t("apiTokens.neverExpire") : format(new Date(token.expiresAt), "yyyy-MM-dd HH:mm") })}
                      </span>
                      {token.lastUsedAt && (
                        <>
                          <span>•</span>
                          <span>
                            {t("apiTokens.lastUsedAt", { value: format(new Date(token.lastUsedAt), "yyyy-MM-dd HH:mm") })}
                          </span>
                        </>
                      )}
                    </div>
                    {token.expired && (
                      <Badge variant="destructive" className="text-xs">
                        {t("apiTokens.expired")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/dashboard/api-tokens/${token.id}`)}
                      className={cn("text-muted-foreground hover:text-foreground")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteId(token.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("apiTokens.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("apiTokens.confirmDeleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("admin.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
