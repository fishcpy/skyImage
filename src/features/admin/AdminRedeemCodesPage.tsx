import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  deleteRedeemCode,
  fetchRedeemCodeUsages,
  fetchRedeemCodes,
  updateRedeemCode,
  type RedeemCodeRecord
} from "@/lib/api";
import { useI18n } from "@/i18n";

function getUsageStatus(item: RedeemCodeRecord): "disabled" | "exhausted" | "unused" | "inUse" {
  if (!item.enabled) return "disabled";
  if (item.maxUses > 0 && item.usedCount >= item.maxUses) return "exhausted";
  if (item.usedCount <= 0) return "unused";
  return "inUse";
}

export function AdminRedeemCodesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: codes, isLoading } = useQuery({
    queryKey: ["admin", "redeem-codes"],
    queryFn: fetchRedeemCodes
  });

  const [usageCode, setUsageCode] = useState<RedeemCodeRecord | null>(null);

  const { data: usages, isLoading: usagesLoading } = useQuery({
    queryKey: ["admin", "redeem-codes", usageCode?.id, "usages"],
    queryFn: () => fetchRedeemCodeUsages(usageCode!.id),
    enabled: Boolean(usageCode?.id)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      updateRedeemCode(id, { enabled }),
    onSuccess: () => {
      toast.success(t("admin.redeem.updated"));
      queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const removeMutation = useMutation({
    mutationFn: deleteRedeemCode,
    onSuccess: () => {
      toast.success(t("admin.redeem.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
    },
    onError: (error) => toast.error(error.message)
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("admin.redeem.copied"));
    } catch {
      toast.error(t("grid.copyFailed"));
    }
  };

  const statusBadge = (item: RedeemCodeRecord) => {
    const status = getUsageStatus(item);
    switch (status) {
      case "disabled":
        return <Badge variant="outline">{t("admin.redeem.statusDisabled")}</Badge>;
      case "exhausted":
        return <Badge variant="destructive">{t("admin.redeem.statusExhausted")}</Badge>;
      case "unused":
        return <Badge variant="secondary">{t("admin.redeem.statusUnused")}</Badge>;
      default:
        return (
          <Badge>
            {t("admin.redeem.statusUsedCount", { count: item.usedCount })}
          </Badge>
        );
    }
  };

  const formatTime = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const formatSignedBytes = (bytes: number) => {
    const sign = bytes < 0 ? "-" : "+";
    const abs = Math.abs(bytes);
    if (abs <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let idx = 0;
    let value = abs;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx++;
    }
    return `${sign}${value.toFixed(2)} ${units[idx]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.redeem.title")}</h1>
          <p className="text-muted-foreground">{t("admin.redeem.description")}</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/admin/redeem-codes/new">{t("admin.redeem.new")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.redeem.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
          {!isLoading && !codes?.length && (
            <p className="text-sm text-muted-foreground">{t("admin.redeem.empty")}</p>
          )}
          {codes?.map((item: RedeemCodeRecord) => (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-medium">{item.code}</p>
                  <Button variant="ghost" size="sm" onClick={() => copyCode(item.code)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {statusBadge(item)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.rewardType === "capacity"
                    ? t("admin.redeem.rewardCapacityShort", {
                        delta: formatSignedBytes(item.capacityDelta ?? 0)
                      })
                    : `${t("admin.redeem.group")}: ${item.group?.name ?? `#${item.groupId ?? "-"}`}`}
                  {" · "}
                  {t("admin.redeem.usage", {
                    used: item.usedCount,
                    max: item.maxUses === 0 ? t("admin.redeem.unlimited") : String(item.maxUses)
                  })}
                  {item.allowMultiRedeem ? ` · ${t("admin.redeem.allowMultiShort")}` : ""}
                </p>
                {item.note ? (
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setUsageCode(item)}>
                  {t("admin.redeem.viewUsages")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({ id: item.id, enabled: !item.enabled })
                  }
                >
                  {item.enabled ? t("admin.redeem.disable") : t("admin.redeem.enable")}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={removeMutation.isPending}>
                      {t("admin.delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("admin.redeem.confirmDeleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("admin.redeem.confirmDeleteDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => removeMutation.mutate(item.id)}
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

      <Dialog open={Boolean(usageCode)} onOpenChange={(open) => !open && setUsageCode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("admin.redeem.usagesTitle")}</DialogTitle>
            <DialogDescription>
              {usageCode
                ? t("admin.redeem.usagesDescription", { code: usageCode.code })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {usagesLoading && (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            )}
            {!usagesLoading && !usages?.length && (
              <p className="text-sm text-muted-foreground">{t("admin.redeem.usagesEmpty")}</p>
            )}
            {usages?.map((usage) => (
              <div key={usage.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">
                  {usage.user?.name || t("common.unknownUser")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {usage.user?.email || t("common.noEmail")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("admin.redeem.usedAt", { time: formatTime(usage.createdAt) })}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
