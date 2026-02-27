import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, X, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/state/auth";
import {
  fetchUploadStrategies,
  uploadFile,
  type FileRecord
} from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";

type QueueItem = {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  error?: string;
  result?: FileRecord;
};

export function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const user = useAuthStore((state) => state.user);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<"public" | "private">(
    user?.defaultVisibility ?? "private"
  );
  const { data: strategyData, isLoading: loadingStrategy } = useQuery({
    queryKey: ["files", "strategies"],
    queryFn: fetchUploadStrategies
  });
  const strategies = strategyData?.strategies ?? [];
  const [strategyId, setStrategyId] = useState<number | undefined>(undefined);

  useEffect(() => {
    setVisibility(user?.defaultVisibility ?? "private");
  }, [user?.defaultVisibility]);

  useEffect(() => {
    if (strategies.length > 0) {
      setStrategyId(
        strategyData?.defaultStrategyId ?? strategies[0]?.id ?? undefined
      );
    }
  }, [strategies, strategyData?.defaultStrategyId]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    };
  }, []);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      status: "pending" as const
    }));
    setQueue((prev) => [...prev, ...next]);
  }, []);

  const removeItem = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const uploadItem = async (item: QueueItem) => {
    if (!strategyId) {
      toast.error("请先配置可用的储存策略");
      return;
    }
    setQueue((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: "uploading", error: undefined } : it
      )
    );
    try {
      const record = await uploadFile({
        file: item.file,
        visibility,
        strategyId
      });
      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: "uploaded", result: record }
            : it
        )
      );
      toast.success(`${item.file.name} 上传成功`);
      
      // 上传成功后立即刷新用户信息（更新已使用存储）
      useAuthStore.getState().refreshUser().catch((err) => {
        console.error('[UploadPage] Failed to refresh user after upload:', err);
      });
    } catch (error: any) {
      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "error",
                error: error?.message || "上传失败"
              }
            : it
        )
      );
    }
  };

  const uploadAll = () => {
    queueRef.current
      .filter((item) => item.status === "pending")
      .forEach((item) => uploadItem(item));
  };

  const queueEmpty = queue.length === 0;
  const uploading = queue.some((item) => item.status === "uploading");

  const statusText = useCallback((item: QueueItem) => {
    switch (item.status) {
      case "pending":
        return "等待上传";
      case "uploading":
        return "上传中...";
      case "uploaded":
        return "已上传";
      case "error":
        return item.error || "上传失败";
      default:
        return "";
    }
  }, []);

  const copy = (text: string) => {
    navigator.clipboard.writeText(normalizeFileUrl(text));
    toast.success("已复制链接");
  };

  const formatSize = (size: number) => {
    if (size > 1024 * 1024) {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(size / 1024).toFixed(2)} KB`;
  };

  const strategyDisabled = loadingStrategy || strategies.length === 0;

  const dropHandlers = {
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(true);
    },
    onDragLeave: () => setIsDragging(false),
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      handleFiles(event.dataTransfer.files);
    }
  };

  const clearQueue = useCallback(() => {
    setQueue((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.preview));
      return [];
    });
    queueRef.current = [];
    setPreview(null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">文件上传</h1>
        <p className="text-muted-foreground">
          按需选择储存策略、可见性并批量上传图片。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>上传文件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
              isDragging ? "border-primary/80 bg-primary/10" : "border-border/60"
            }`}
            onClick={() => fileInputRef.current?.click()}
            {...dropHandlers}
          >
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              拖拽文件到这里，支持批量上传
            </p>
            <p className="text-xs text-muted-foreground">
              点击上方图标也可以选择文件
            </p>
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>

          <div className="flex flex-col gap-3 border-t pt-4">
            {queueEmpty && (
              <p className="text-sm text-muted-foreground">
                暂无文件，选择或拖拽图片开始上传。
              </p>
            )}
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="h-12 w-12 overflow-hidden rounded-md border bg-muted"
                    onClick={() => setPreview(item.preview)}
                  >
                    <img
                      src={item.preview}
                      alt={item.file.name}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <div>
                    <p className="text-sm font-medium">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(item.file.size)} · {statusText(item)}
                    </p>
                    {item.result && (
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0"
                          onClick={() => copy(item.result!.directUrl)}
                        >
                          复制链接
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="px-0"
                          onClick={() => copy(item.result!.markdown)}
                        >
                          Markdown
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreview(item.preview)}
                    title="预览"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  {item.status === "pending" && (
                    <Button
                      size="sm"
                      onClick={() => uploadItem(item)}
                      disabled={strategyDisabled}
                    >
                      上传
                    </Button>
                  )}
                  {item.status === "uploading" && (
                    <Button size="sm" variant="outline" disabled>
                      上传中...
                    </Button>
                  )}
                  {item.status !== "uploaded" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                    >
                      <X className="mr-1 h-4 w-4" />
                      不上传
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-border/40 bg-muted/40 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">默认可见性</label>
                <Select
                  value={visibility}
                  onValueChange={(value) =>
                    setVisibility(value as "public" | "private")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择可见性" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">私有</SelectItem>
                    <SelectItem value="public">公开</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">储存策略</label>
                <Select
                  value={strategyId?.toString() ?? ""}
                  onValueChange={(value) =>
                    setStrategyId(value ? Number(value) : undefined)
                  }
                  disabled={strategyDisabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择储存策略" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategies.map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.id.toString()}>
                        {strategy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {strategyDisabled && (
                  <p className="text-xs text-destructive">
                    请先在后台配置储存策略并关联角色组。
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={uploadAll}
                disabled={
                  queue.filter((item) => item.status === "pending").length === 0 ||
                  uploading ||
                  strategyDisabled
                }
              >
                <UploadCloud className="mr-2 h-4 w-4" />
                上传全部待上传文件
              </Button>
              <Button variant="ghost" onClick={clearQueue} disabled={queueEmpty}>
                清空列表
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview}
            alt="预览"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
