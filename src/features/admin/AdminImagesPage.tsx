import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileTable } from "@/features/files/components/FileTable";
import {
  fetchAdminImages,
  deleteAdminImage,
  type FileRecord
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
      <Card>
        <CardHeader>
          <CardTitle>全部文件</CardTitle>
        </CardHeader>
        <CardContent>
          <FileTable
            files={data as FileRecord[]}
            isLoading={isLoading}
            onDelete={(id) => deleteMutation.mutate(id)}
            deletingId={deletingId}
            showOwner
          />
        </CardContent>
      </Card>
    </div>
  );
}
