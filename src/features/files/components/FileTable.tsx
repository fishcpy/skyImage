import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { FileRecord } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";

type Props = {
  files?: FileRecord[];
  isLoading: boolean;
  onDelete?: (id: number) => void;
  deletingId?: number;
  showOwner?: boolean;
  onPreview?: (file: FileRecord) => void;
};

export function FileTable({
  files,
  isLoading,
  onDelete,
  deletingId,
  showOwner,
  onPreview
}: Props) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  if (!files?.length) {
    return <p className="text-sm text-muted-foreground">暂无文件</p>;
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      {/* 桌面端表格 */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>预览</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>可见性</TableHead>
              <TableHead>大小</TableHead>
              {showOwner && <TableHead>所有者</TableHead>}
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <img
                    src={normalizeFileUrl(item.viewUrl || item.directUrl)}
                    alt={item.originalName}
                    className="h-12 w-12 rounded-md object-cover"
                  />
                </TableCell>
                <TableCell className="max-w-[220px]">
                  <p className="truncate font-medium">{item.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.strategyName ? `策略：${item.strategyName}` : "策略：默认"}
                  </p>
                </TableCell>
                <TableCell>
                  {item.visibility === "public" ? "公开" : "私有"}
                </TableCell>
                <TableCell>{(item.size / 1024).toFixed(1)} KB</TableCell>
                {showOwner && <TableCell>{(item as any).ownerName ?? "-"}</TableCell>}
                <TableCell className="space-x-2 text-right">
                  {onPreview && (
                    <Button variant="ghost" size="sm" onClick={() => onPreview(item)}>
                      预览
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copy(normalizeFileUrl(item.directUrl))}
                  >
                    复制链接
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copy(item.markdown)}
                  >
                    Markdown
                  </Button>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(item.id)}
                      disabled={deletingId === item.id}
                    >
                      删除
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 移动端卡片列表 */}
      <div className="md:hidden space-y-3">
        {files.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border bg-card p-3 space-y-3"
          >
            <div className="flex gap-3">
              <img
                src={normalizeFileUrl(item.viewUrl || item.directUrl)}
                alt={item.originalName}
                className="h-16 w-16 rounded-md object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-sm">{item.originalName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.strategyName ? `策略：${item.strategyName}` : "策略：默认"}
                </p>
                <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{item.visibility === "public" ? "公开" : "私有"}</span>
                  <span>·</span>
                  <span>{(item.size / 1024).toFixed(1)} KB</span>
                  {showOwner && (
                    <>
                      <span>·</span>
                      <span>{(item as any).ownerName ?? "-"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {onPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onPreview(item)}
                >
                  预览
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => copy(normalizeFileUrl(item.directUrl))}
              >
                复制链接
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => copy(item.markdown)}
              >
                Markdown
              </Button>
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onDelete(item.id)}
                  disabled={deletingId === item.id}
                >
                  删除
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
