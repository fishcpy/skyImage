import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteFile, fetchFiles, type FileRecord } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";
import { useAuthStore } from "@/state/auth";
import { FileTable } from "./components/FileTable";

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
      <Card>
        <CardHeader>
          <CardTitle>图片列表</CardTitle>
        </CardHeader>
        <CardContent>
          <FileTable
            files={files}
            isLoading={isLoading}
            onDelete={(id) => deleteMutation.mutate(id)}
            deletingId={deletingId}
            onPreview={(file) => setPreview(file)}
          />
        </CardContent>
      </Card>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
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
