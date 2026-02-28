import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { FileRecord } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";

type Props = {
  files?: FileRecord[];
  isLoading: boolean;
  onDelete?: (id: number) => void | Promise<void>;
  deletingId?: number;
  showOwner?: boolean;
  onPreview?: (file: FileRecord) => void;
  onVisibilityChange?: (
    id: number,
    visibility: "public" | "private"
  ) => void | Promise<void>;
  onBatchVisibilityChange?: (
    ids: number[],
    visibility: "public" | "private"
  ) => void | Promise<void>;
  onBatchDelete?: (ids: number[]) => void | Promise<void>;
};

type MenuState = {
  file: FileRecord;
  x: number;
  y: number;
  scope: "single" | "selection";
};

export function ImageGrid({
  files,
  isLoading,
  onDelete,
  deletingId,
  showOwner,
  onPreview,
  onVisibilityChange,
  onBatchVisibilityChange,
  onBatchDelete
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const handleClose = () => setMenu(null);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(null);
      }
    };
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu || !menuRef.current) {
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    let nextX = menu.x;
    let nextY = menu.y;
    const padding = 8;
    if (nextX + rect.width + padding > window.innerWidth) {
      nextX = window.innerWidth - rect.width - padding;
    }
    if (nextY + rect.height + padding > window.innerHeight) {
      nextY = window.innerHeight - rect.height - padding;
    }
    if (nextX < padding) nextX = padding;
    if (nextY < padding) nextY = padding;
    setMenuPos({ x: nextX, y: nextY });
  }, [menu]);

  const items = files ?? [];

  useEffect(() => {
    if (!items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds((prev) => {
        const next = new Set<number>();
        const idSet = new Set(items.map((item) => item.id));
        prev.forEach((id) => {
          if (idSet.has(id)) {
            next.add(id);
          }
        });
        return next;
      });
    }
  }, [items]);

  const handleCopy = useCallback(async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch (err) {
      console.error("[ImageGrid] Failed to copy:", err);
      toast.error("复制失败，请手动复制");
    }
  }, []);

  const menuItems = useMemo(() => {
    if (!menu) {
      return [];
    }
    const file = menu.file;
    const selectedList = Array.from(selectedIds);
    const selectionCount = selectedList.length;
    const useSelection = menu.scope === "selection" && selectionCount > 0;
    const activeIds = useSelection ? selectedList : [file.id];
    const isMulti = activeIds.length > 1;
    const directUrl = normalizeFileUrl(file.directUrl);
    const viewUrl = normalizeFileUrl(file.viewUrl || file.directUrl);
    const visibility = file.visibility === "public" ? "private" : "public";
    const visibilityLabel = visibility === "public" ? "设为公开" : "设为私有";
    const canToggleVisibility = useSelection
      ? Boolean(onBatchVisibilityChange)
      : Boolean(onVisibilityChange);
    const selectionLabelSuffix = isMulti ? `（选中 ${activeIds.length}）` : "";

    return [
      {
        label: "预览",
        action: () => onPreview?.(file),
        enabled: Boolean(onPreview) && !isMulti
      },
      {
        label: "在新标签打开",
        action: () => window.open(viewUrl, "_blank", "noreferrer"),
        enabled: !isMulti
      },
      {
        label: "复制链接",
        action: () => handleCopy(directUrl, "已复制链接"),
        enabled: !isMulti
      },
      {
        label: "复制 Markdown",
        action: () => handleCopy(file.markdown, "已复制 Markdown"),
        enabled: !isMulti
      },
      {
        label: "复制 HTML",
        action: () => handleCopy(file.html, "已复制 HTML"),
        enabled: !isMulti
      },
      {
        label: `${visibilityLabel}${selectionLabelSuffix}`,
        action: async () => {
          if (batchBusy) return;
          if (useSelection) {
            if (!onBatchVisibilityChange) return;
          } else {
            if (!onVisibilityChange) return;
          }
          setBatchBusy(true);
          try {
            if (useSelection && onBatchVisibilityChange) {
              await onBatchVisibilityChange(activeIds, visibility as "public" | "private");
            } else if (onVisibilityChange) {
              await onVisibilityChange(activeIds[0], visibility as "public" | "private");
            }
          } finally {
            setBatchBusy(false);
          }
        },
        enabled: canToggleVisibility
      },
      {
        label: `删除${selectionLabelSuffix}`,
        action: async () => {
          if (batchBusy) return;
          if (useSelection) {
            if (!onBatchDelete) return;
          } else {
            if (!onDelete) return;
          }
          setBatchBusy(true);
          try {
            if (useSelection && onBatchDelete) {
              await onBatchDelete(activeIds);
            } else if (onDelete) {
              await onDelete(activeIds[0]);
            }
          } finally {
            setBatchBusy(false);
            setSelectedIds(new Set());
          }
        },
        enabled: useSelection ? Boolean(onBatchDelete) : Boolean(onDelete),
        danger: true
      },
      {
        label: "清空选择",
        action: () => setSelectedIds(new Set()),
        enabled: selectedIds.size > 0 && menu.scope === "selection"
      }
    ].filter((item) => item.enabled);
  }, [batchBusy, handleCopy, menu, onDelete, onPreview, onVisibilityChange, selectedIds]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">加载中...</p>;
  }

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">暂无图片</p>;
  }

  const hasSelection = selectedIds.size > 0;

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="relative">
      {hasSelection && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <span className="text-muted-foreground">
            已选择 {selectedIds.size} 张
          </span>
          <button
            type="button"
            className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            onClick={() => setSelectedIds(new Set())}
          >
            清空
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
              onClick={async () => {
                if (!onBatchVisibilityChange || batchBusy) return;
                setBatchBusy(true);
                try {
                  await onBatchVisibilityChange(
                    Array.from(selectedIds),
                    "public"
                  );
                } finally {
                  setBatchBusy(false);
                }
              }}
            >
              批量公开
            </button>
            <button
              type="button"
              className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
              onClick={async () => {
                if (!onBatchVisibilityChange || batchBusy) return;
                setBatchBusy(true);
                try {
                  await onBatchVisibilityChange(
                    Array.from(selectedIds),
                    "private"
                  );
                } finally {
                  setBatchBusy(false);
                }
              }}
            >
              批量私有
            </button>
            <button
              type="button"
              className="rounded-md border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (!onBatchDelete || batchBusy) return;
                setBatchBusy(true);
                try {
                  await onBatchDelete(Array.from(selectedIds));
                } finally {
                  setBatchBusy(false);
                  setSelectedIds(new Set());
                }
              }}
            >
              批量删除
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-4 lg:gap-5">
        {items.map((item) => {
          const imageUrl = normalizeFileUrl(item.viewUrl || item.directUrl);
          const visibilityLabel = item.visibility === "public" ? "公开" : "私有";
          const isSelected = selectedIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={[
                "group relative h-[240px] w-full overflow-hidden rounded-xl border bg-muted/30 text-left shadow-sm transition hover:shadow-lg sm:h-[260px] lg:h-[280px]",
                isSelected ? "ring-2 ring-primary/70" : ""
              ].join(" ")}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || hasSelection) {
                  toggleSelection(item.id);
                  return;
                }
                onPreview?.(item);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (selectedIds.size === 0) {
                  setSelectedIds(new Set([item.id]));
                  setMenu({ file: item, x: event.clientX, y: event.clientY, scope: "single" });
                } else {
                  setMenu({ file: item, x: event.clientX, y: event.clientY, scope: "selection" });
                }
                setMenuPos({ x: event.clientX, y: event.clientY });
              }}
            >
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/60 via-transparent to-muted/40">
                <img
                  src={imageUrl}
                  alt={item.originalName}
                  className="max-h-full max-w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-80" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <div className="flex items-center gap-2 text-white">
                  <p className="flex-1 truncate text-sm font-semibold">
                    {item.originalName}
                  </p>
                  <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px]">
                    {visibilityLabel}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/80">
                  <span>{(item.size / 1024).toFixed(1)} KB</span>
                  {showOwner && (
                    <span className="truncate">
                      · {(item as any).ownerName ?? "-"}
                    </span>
                  )}
                  {item.strategyName && (
                    <span className="truncate">· {item.strategyName}</span>
                  )}
                </div>
              </div>
              <span
                className={[
                  "absolute left-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded border text-[11px]",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/50 bg-black/30 text-white/80"
                ].join(" ")}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSelection(item.id);
                }}
              >
                {isSelected ? "✓" : ""}
              </span>
              <button
                type="button"
                className="absolute right-3 top-3 rounded-md border border-white/40 bg-black/35 px-2 py-0.5 text-xs text-white/80 backdrop-blur transition hover:bg-black/50"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  setMenu({ file: item, x: rect.right, y: rect.bottom, scope: "single" });
                  setMenuPos({ x: rect.right, y: rect.bottom });
                }}
              >
                •••
              </button>
              {deletingId === item.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                  删除中...
                </div>
              )}
            </button>
          );
        })}
      </div>

      {menu && menuPos && (
        <div
          ref={menuRef}
          className="fixed z-[70] min-w-[190px] overflow-hidden rounded-lg border bg-background shadow-2xl"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {menu.file.originalName}
          </div>
          <div className="h-px bg-border" />
          <div className="py-1">
            {menuItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={[
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition",
                  item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "text-foreground hover:bg-muted"
                ].join(" ")}
                onClick={() => {
                  item.action();
                  setMenu(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
