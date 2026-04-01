import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ImageGrid } from "@/features/files/components/ImageGrid";
import {
  fetchAdminImages,
  fetchSiteConfig,
  deleteAdminImage,
  deleteAdminImagesBatch,
  updateAdminImageVisibility,
  updateAdminImagesVisibilityBatch,
  updateAdminImageAuditStatus
} from "@/lib/api";
import { useI18n } from "@/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

export function AdminImagesPage() {
  const { t } = useI18n();
  const pageSize = 80;
  const queryClient = useQueryClient();
  const [auditStatus, setAuditStatus] = useState("all");
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    staleTime: 5 * 60 * 1000
  });
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ["admin", "images", auditStatus],
    queryFn: ({ pageParam = 0 }) =>
      fetchAdminImages({
        limit: pageSize,
        offset: pageParam,
        auditStatus: auditStatus === "all" ? undefined : auditStatus
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) {
        return undefined;
      }
      return allPages.reduce((total, page) => total + page.length, 0);
    }
  });

  const files = data?.pages.flatMap((page) => page) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (payload: { id: number; reason?: string }) =>
      deleteAdminImage(payload.id, payload.reason),
    onSuccess: () => {
      toast.success(t("admin.images.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    }
  });

  const visibilityMutation = useMutation({
    mutationFn: (payload: { id: number; visibility: "public" | "private" }) =>
      updateAdminImageVisibility(payload.id, payload.visibility),
    onSuccess: () => {
      toast.success(t("images.permissionUpdated"));
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    },
    onError: (error) => toast.error(error.message || t("images.permissionUpdateFailed"))
  });

  const batchVisibilityMutation = useMutation({
    mutationFn: (payload: { ids: number[]; visibility: "public" | "private" }) =>
      updateAdminImagesVisibilityBatch(payload.ids, payload.visibility),
    onSuccess: () => {
      toast.success(t("images.batchPermissionUpdated"));
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    },
    onError: (error) => toast.error(error.message || t("images.batchPermissionUpdateFailed"))
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (payload: { ids: number[]; reason?: string }) =>
      deleteAdminImagesBatch(payload.ids, payload.reason),
    onSuccess: () => {
      toast.success(t("images.batchDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    },
    onError: (error) => toast.error(error.message || t("images.batchDeleteFailed"))
  });

  const approveAuditMutation = useMutation({
    mutationFn: (id: number) => updateAdminImageAuditStatus(id, "approved"),
    onSuccess: () => {
      toast.success(t("admin.images.auditApproved"));
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => toast.error(error.message || t("admin.images.auditApproveFailed"))
  });

  const deletingId =
    typeof deleteMutation.variables?.id === "number"
      ? deleteMutation.variables.id
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.images.title")}</h1>
        <p className="text-muted-foreground">
          {t("admin.images.description")}
        </p>
      </div>
      <div className="max-w-xs">
        <Select value={auditStatus} onValueChange={setAuditStatus}>
          <SelectTrigger>
            <SelectValue placeholder={t("admin.images.auditFilter")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.images.auditFilterAll")}</SelectItem>
            <SelectItem value="approved">{t("audit.status.approved")}</SelectItem>
            <SelectItem value="pending">{t("audit.status.pending")}</SelectItem>
            <SelectItem value="rejected">{t("audit.status.rejected")}</SelectItem>
            <SelectItem value="error">{t("audit.status.error")}</SelectItem>
            <SelectItem value="none">{t("audit.status.none")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ImageGrid
        files={files}
        isLoading={isLoading}
        hasMore={Boolean(hasNextPage)}
        isFetchingMore={isFetchingNextPage}
        onLoadMore={async () => {
          await fetchNextPage();
        }}
        loadRowsPerBatch={siteConfig?.imageLoadRows ?? 4}
        onDelete={(id, reason) => deleteMutation.mutateAsync({ id, reason })}
        deletingId={deletingId}
        showOwner
        onVisibilityChange={(id, visibility) => {
          void visibilityMutation.mutateAsync({ id, visibility });
        }}
        onBatchVisibilityChange={(ids, visibility) => {
          void batchVisibilityMutation.mutateAsync({ ids, visibility });
        }}
        onBatchDelete={(ids, reason) => {
          void batchDeleteMutation.mutateAsync({ ids, reason });
        }}
        enableDeleteReason
        onAuditApprove={(id) => {
          void approveAuditMutation.mutateAsync(id);
        }}
        approvingAuditId={
          approveAuditMutation.isPending && typeof approveAuditMutation.variables === "number"
            ? approveAuditMutation.variables
            : undefined
        }
      />
    </div>
  );
}
