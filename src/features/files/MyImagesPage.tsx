import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deleteFile,
  deleteFilesBatch,
  fetchFiles,
  fetchSiteConfig,
  updateFileVisibility,
  updateFilesVisibilityBatch
} from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { ImageGrid } from "./components/ImageGrid";
import { useI18n } from "@/i18n";

export function MyImagesPage() {
  const { t } = useI18n();
  const pageSize = 60;
  const queryClient = useQueryClient();
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
    queryKey: ["files"],
    queryFn: ({ pageParam = 0 }) =>
      fetchFiles({ limit: pageSize, offset: pageParam }),
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
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["files"] });
      // 删除成功后立即刷新用户信息（更新已使用存储）
      useAuthStore.getState().refreshUser().catch((err) => {
        console.error('[MyImagesPage] Failed to refresh user after delete:', err);
      });
    }
  });

  const visibilityMutation = useMutation({
    mutationFn: (payload: { id: number; visibility: "public" | "private" }) =>
      updateFileVisibility(payload.id, payload.visibility),
    onSuccess: () => {
      toast.success(t("images.permissionUpdated"));
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => {
      toast.error(error.message || t("images.permissionUpdateFailed"));
    }
  });

  const batchVisibilityMutation = useMutation({
    mutationFn: (payload: { ids: number[]; visibility: "public" | "private" }) =>
      updateFilesVisibilityBatch(payload.ids, payload.visibility),
    onSuccess: () => {
      toast.success(t("images.batchPermissionUpdated"));
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => {
      toast.error(error.message || t("images.batchPermissionUpdateFailed"));
    }
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteFilesBatch(ids),
    onSuccess: () => {
      toast.success(t("images.batchDeleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["files"] });
      useAuthStore.getState().refreshUser().catch((err) => {
        console.error("[MyImagesPage] Failed to refresh user after batch delete:", err);
      });
    },
    onError: (error) => {
      toast.error(error.message || t("images.batchDeleteFailed"));
    }
  });

  const deletingId =
    typeof deleteMutation.variables === "number"
      ? deleteMutation.variables
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("images.title")}</h1>
        <p className="text-muted-foreground">{t("images.description")}</p>
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
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        deletingId={deletingId}
        onVisibilityChange={(id, visibility) => {
          void visibilityMutation.mutateAsync({ id, visibility });
        }}
        onBatchVisibilityChange={(ids, visibility) => {
          void batchVisibilityMutation.mutateAsync({ ids, visibility });
        }}
        onBatchDelete={(ids) => {
          void batchDeleteMutation.mutateAsync(ids);
        }}
      />
    </div>
  );
}
