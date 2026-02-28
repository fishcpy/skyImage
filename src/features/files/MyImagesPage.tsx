import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { toast } from "sonner";

import {
  deleteFile,
  deleteFilesBatch,
  fetchFiles,
  type FileRecord,
  updateFileVisibility,
  updateFilesVisibilityBatch
} from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";
import { useAuthStore } from "@/state/auth";
import { ImageGrid } from "./components/ImageGrid";

export function MyImagesPage() {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<FileRecord | null>(null);
  const { data: files, isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: fetchFiles
  });

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
      toast.success("权限已更新");
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => {
      toast.error(error.message || "更新权限失败");
    }
  });

  const batchVisibilityMutation = useMutation({
    mutationFn: (payload: { ids: number[]; visibility: "public" | "private" }) =>
      updateFilesVisibilityBatch(payload.ids, payload.visibility),
    onSuccess: () => {
      toast.success("批量权限已更新");
      queryClient.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (error) => {
      toast.error(error.message || "批量更新权限失败");
    }
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteFilesBatch(ids),
    onSuccess: () => {
      toast.success("批量删除成功");
      queryClient.invalidateQueries({ queryKey: ["files"] });
      useAuthStore.getState().refreshUser().catch((err) => {
        console.error("[MyImagesPage] Failed to refresh user after batch delete:", err);
      });
    },
    onError: (error) => {
      toast.error(error.message || "批量删除失败");
    }
  });

  const deletingId =
    typeof deleteMutation.variables === "number"
      ? deleteMutation.variables
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我的图片</h1>
        <p className="text-muted-foreground">查看、管理、删除你已经上传的所有内容。</p>
      </div>
      <ImageGrid
        files={files}
        isLoading={isLoading}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        deletingId={deletingId}
        onPreview={(file) => setPreview(file)}
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
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="space-y-4 rounded-lg bg-background p-4 shadow-2xl">
              <img
                src={normalizeFileUrl(preview.viewUrl || preview.directUrl)}
                alt={preview.originalName}
                className="max-h-[70vh] max-w-[80vw] rounded-md object-contain"
              />
            <p className="text-center text-sm text-muted-foreground">
              {preview.originalName} · {(preview.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
