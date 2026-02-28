import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ImageGrid } from "@/features/files/components/ImageGrid";
import {
  fetchAdminImages,
  deleteAdminImage,
  deleteAdminImagesBatch,
  type FileRecord,
  updateAdminImageVisibility,
  updateAdminImagesVisibilityBatch
} from "@/lib/api";

export function AdminImagesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "images"],
    queryFn: () => fetchAdminImages({ limit: 100 })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminImage(id),
    onSuccess: () => {
      toast.success("已删除图片");
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    }
  });

  const visibilityMutation = useMutation({
    mutationFn: (payload: { id: number; visibility: "public" | "private" }) =>
      updateAdminImageVisibility(payload.id, payload.visibility),
    onSuccess: () => {
      toast.success("权限已更新");
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    },
    onError: (error) => toast.error(error.message || "更新权限失败")
  });

  const batchVisibilityMutation = useMutation({
    mutationFn: (payload: { ids: number[]; visibility: "public" | "private" }) =>
      updateAdminImagesVisibilityBatch(payload.ids, payload.visibility),
    onSuccess: () => {
      toast.success("批量权限已更新");
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    },
    onError: (error) => toast.error(error.message || "批量更新权限失败")
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteAdminImagesBatch(ids),
    onSuccess: () => {
      toast.success("批量删除成功");
      queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
    },
    onError: (error) => toast.error(error.message || "批量删除失败")
  });

  const deletingId =
    typeof deleteMutation.variables === "number"
      ? deleteMutation.variables
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">图片管理</h1>
        <p className="text-muted-foreground">
          管理所有用户的上传内容，支持审核与删除。
        </p>
      </div>
      <ImageGrid
        files={data as FileRecord[]}
        isLoading={isLoading}
        onDelete={(id) => deleteMutation.mutateAsync(id)}
        deletingId={deletingId}
        showOwner
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
