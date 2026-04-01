import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

import type { FileRecord } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";
import { useI18n } from "@/i18n";
import { FileAuditBadge } from "@/features/files/components/FileAuditBadge";

// 固定行高（像素）
const ROW_HEIGHT = 240;
// 图片间距
const GAP = 16;

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

type Props = {
  files?: FileRecord[];
  isLoading: boolean;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  loadRowsPerBatch?: number;
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
  onAuditApprove?: (id: number) => void | Promise<void>;
  approvingAuditId?: number;
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
  hasMore = false,
  isFetchingMore = false,
  onLoadMore,
  loadRowsPerBatch = 4,
  onDelete,
  deletingId,
  showOwner,
  onPreview,
  onVisibilityChange,
  onBatchVisibilityChange,
  onBatchDelete,
  onAuditApprove,
  approvingAuditId
}: Props) {
  const { t } = useI18n();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[] | null>(null);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState("");
  const [baseVisibleRows, setBaseVisibleRows] = useState(0);
  const [extraVisibleRows, setExtraVisibleRows] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreLockRef = useRef(false);
  const prevFirstIdRef = useRef<number | null>(null);
  
  // 新增状态：容器引用、宽度和图片尺寸
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<Map<number, { width: number; height: number }>>(new Map());

  const items = files ?? [];
  const normalizedBatchRows = Math.max(1, Math.min(20, Math.trunc(loadRowsPerBatch || 4)));

  // 初始化 Fancybox
  useEffect(() => {
    Fancybox.bind("[data-fancybox='gallery']", {} as any);

    return () => {
      Fancybox.destroy();
    };
  }, [items]);

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
    const timeoutId = setTimeout(() => {
      window.addEventListener("click", handleClose);
      window.addEventListener("contextmenu", handleClose);
      window.addEventListener("scroll", handleClose, true);
      window.addEventListener("resize", handleClose);
      window.addEventListener("keydown", handleKey);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
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

  // 提前测量容器宽度，避免先用错误默认值布局后再重排导致闪烁
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setContainerWidth(element.offsetWidth);
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [isLoading, items.length]);

  // 加载图片尺寸
  useEffect(() => {
    if (items.length === 0) return;
    
    const loadImageDimensions = async () => {
      const newDimensions = new Map<number, { width: number; height: number }>();
      
      await Promise.all(
        items.map((item) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              newDimensions.set(item.id, { width: img.width, height: img.height });
              resolve();
            };
            img.onerror = () => {
              newDimensions.set(item.id, { width: 1, height: 1 });
              resolve();
            };
            img.src = normalizeFileUrl(item.viewUrl || item.directUrl);
          });
        })
      );
      
      setImageDimensions(newDimensions);
    };
    
    loadImageDimensions();
  }, [items]);

  // 计算图片布局
  const imageRows = useMemo(() => {
    if (items.length === 0 || imageDimensions.size < items.length || containerWidth <= 0) {
      return [];
    }

    const rows: Array<Array<{ item: FileRecord; width: number }>> = [];
    let currentRow: Array<{ item: FileRecord; width: number }> = [];
    let currentRowWidth = 0;

    items.forEach((item, index) => {
      const dims = imageDimensions.get(item.id) || { width: 1, height: 1 };
      const aspectRatio = dims.width / dims.height;
      const calculatedWidth = ROW_HEIGHT * aspectRatio;

      const widthWithGap = currentRowWidth + (currentRow.length > 0 ? GAP : 0) + calculatedWidth;

      if (currentRow.length === 0 || widthWithGap <= containerWidth * 1.1) {
        currentRow.push({ item, width: calculatedWidth });
        currentRowWidth = widthWithGap;
      } else {
        if (currentRow.length > 0) {
          const scale = (containerWidth - (currentRow.length - 1) * GAP) / (currentRowWidth - (currentRow.length - 1) * GAP);
          currentRow.forEach(img => {
            img.width = img.width * scale;
          });
          rows.push(currentRow);
        }
        
        currentRow = [{ item, width: calculatedWidth }];
        currentRowWidth = calculatedWidth;
      }

      if (index === items.length - 1 && currentRow.length > 0) {
        // 最后一行也进行缩放以填满容器
        const scale = (containerWidth - (currentRow.length - 1) * GAP) / (currentRowWidth - (currentRow.length - 1) * GAP);
        currentRow.forEach(img => {
          img.width = img.width * scale;
        });
        rows.push(currentRow);
      }
    });

    return rows;
  }, [items, imageDimensions, containerWidth]);

  const bootstrapRows = useMemo(() => {
    if (typeof window === "undefined") {
      return 2;
    }
    const viewportRows = Math.ceil(window.innerHeight / (ROW_HEIGHT + GAP));
    return Math.max(1, viewportRows + 2);
  }, [containerWidth]);

  const requestMoreData = useCallback(async () => {
    if (!hasMore || isFetchingMore || !onLoadMore || loadMoreLockRef.current) {
      return;
    }
    loadMoreLockRef.current = true;
    try {
      await onLoadMore();
    } finally {
      loadMoreLockRef.current = false;
    }
  }, [hasMore, isFetchingMore, onLoadMore]);

  useEffect(() => {
    const firstId = items[0]?.id ?? null;
    if (prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current) {
      setBaseVisibleRows(0);
      setExtraVisibleRows(0);
    }
    prevFirstIdRef.current = firstId;
    if (!items.length) {
      setBaseVisibleRows(0);
      setExtraVisibleRows(0);
    }
  }, [items]);

  useEffect(() => {
    if (imageRows.length === 0) {
      setBaseVisibleRows(0);
      setExtraVisibleRows(0);
      return;
    }
    const target = Math.min(imageRows.length, bootstrapRows);
    setBaseVisibleRows((prev) => {
      if (prev === 0) {
        return target;
      }
      if (prev < target) {
        return target;
      }
      if (prev > imageRows.length) {
        return imageRows.length;
      }
      return prev;
    });
  }, [bootstrapRows, imageRows.length]);

  useEffect(() => {
    const target = Math.min(imageRows.length, bootstrapRows);
    if (imageRows.length < target && hasMore) {
      void requestMoreData();
    }
  }, [bootstrapRows, hasMore, imageRows.length, requestMoreData]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) {
          return;
        }
        const currentVisible = Math.min(imageRows.length, baseVisibleRows + extraVisibleRows);
        const currentBootstrapTarget = Math.min(imageRows.length, bootstrapRows);

        if (currentVisible < currentBootstrapTarget) {
          setBaseVisibleRows(currentBootstrapTarget);
          return;
        }

        if (currentVisible < imageRows.length) {
          setExtraVisibleRows((prev) => prev + normalizedBatchRows);
          return;
        }

        if (hasMore) {
          void requestMoreData();
        }
      },
      {
        root: null,
        rootMargin: "250px 0px 250px 0px",
        threshold: 0.01
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    baseVisibleRows,
    bootstrapRows,
    extraVisibleRows,
    hasMore,
    imageRows.length,
    normalizedBatchRows,
    requestMoreData
  ]);

  const visibleRowCount = Math.min(imageRows.length, baseVisibleRows + extraVisibleRows);
  const visibleRows = imageRows.slice(0, visibleRowCount);

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
      toast.error(t("grid.copyFailed"));
    }
  }, [t]);

  const executeDelete = useCallback(
    async (ids: number[]) => {
      if (batchBusy) return;
      if (ids.length > 1) {
        if (!onBatchDelete) return;
      } else if (!onDelete) {
        return;
      }

      setBatchBusy(true);
      try {
        if (ids.length > 1 && onBatchDelete) {
          await onBatchDelete(ids);
        } else if (onDelete) {
          await onDelete(ids[0]);
        }
      } finally {
        setBatchBusy(false);
        setSelectedIds(new Set());
        setPendingDeleteIds(null);
        setPendingDeleteLabel("");
      }
    },
    [batchBusy, onBatchDelete, onDelete]
  );

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
    const visibilityLabel = visibility === "public" ? t("grid.makePublic") : t("grid.makePrivate");
    const canToggleVisibility = useSelection
      ? Boolean(onBatchVisibilityChange)
      : Boolean(onVisibilityChange);
    const selectionLabelSuffix = isMulti ? t("grid.selectionSuffix", { count: activeIds.length }) : "";
    const canApproveAudit =
      !isMulti &&
      Boolean(onAuditApprove) &&
      ["pending", "rejected", "error"].includes(file.audit?.status ?? "");

    return [
      {
        label: t("grid.preview"),
        action: () => {
          if (onPreview) {
            onPreview(file);
          } else {
            // 使用 Fancybox 预览
            Fancybox.show([{ src: viewUrl, caption: file.originalName }]);
          }
        },
        enabled: !isMulti
      },
      {
        label: t("grid.openNewTab"),
        action: () => window.open(viewUrl, "_blank", "noreferrer"),
        enabled: !isMulti
      },
      {
        label: t("grid.copyLink"),
        action: () => handleCopy(directUrl, t("grid.copiedLink")),
        enabled: !isMulti
      },
      {
        label: t("grid.copyMarkdown"),
        action: () => handleCopy(file.markdown, t("grid.copiedMarkdown")),
        enabled: !isMulti
      },
      {
        label: t("grid.copyHtml"),
        action: () => handleCopy(file.html, t("grid.copiedHtml")),
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
        label: t("grid.approveAudit"),
        action: async () => {
          if (!onAuditApprove || batchBusy) return;
          setBatchBusy(true);
          try {
            await onAuditApprove(file.id);
          } finally {
            setBatchBusy(false);
          }
        },
        enabled: canApproveAudit
      },
      {
        label: `${t("grid.deleteSelected")}${selectionLabelSuffix}`,
        action: () => {
          setPendingDeleteIds(activeIds);
          setPendingDeleteLabel(isMulti ? t("grid.selectedItems", { count: activeIds.length }) : `「${file.originalName}」`);
        },
        enabled: useSelection ? Boolean(onBatchDelete) : Boolean(onDelete),
        danger: true
      },
      {
        label: t("grid.clearSelection"),
        action: () => setSelectedIds(new Set()),
        enabled: selectedIds.size > 0 && menu.scope === "selection"
      }
    ].filter((item) => item.enabled);
  }, [
    batchBusy,
    handleCopy,
    menu,
    onBatchVisibilityChange,
    onBatchDelete,
    onAuditApprove,
    onDelete,
    onPreview,
    onVisibilityChange,
    selectedIds
  ]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">{t("grid.empty")}</p>;
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

  const selectAll = () => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  };

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="relative">
      {hasSelection && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <span className="text-muted-foreground">
            {t("grid.selectedCount", { count: selectedIds.size })}
          </span>
          <button
            type="button"
            className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            onClick={selectAll}
            disabled={isAllSelected}
          >
            {t("grid.selectAll")}
          </button>
          <button
            type="button"
            className="rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
            onClick={() => setSelectedIds(new Set())}
          >
            {t("grid.clear")}
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
              {t("grid.batchPublic")}
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
              {t("grid.batchPrivate")}
            </button>
            <button
              type="button"
              className="rounded-md border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => {
                const ids = Array.from(selectedIds);
                if (!ids.length) return;
                setPendingDeleteIds(ids);
                setPendingDeleteLabel(t("grid.selectedItems", { count: ids.length }));
              }}
            >
              {t("grid.batchDelete")}
            </button>
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex w-full flex-col" style={{ gap: `${GAP}px` }}>
        {imageDimensions.size < items.length || containerWidth <= 0 ? (
          <p className="text-sm text-muted-foreground">{t("grid.loadingImages")}</p>
        ) : (
          visibleRows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex w-full" style={{ gap: `${GAP}px`, height: `${ROW_HEIGHT}px` }}>
              {row.map(({ item, width }) => {
                const imageUrl = normalizeFileUrl(item.viewUrl || item.directUrl);
                const visibilityLabel = item.visibility === "public" ? t("grid.public") : t("grid.private");
                const isSelected = selectedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={[
                      "group relative overflow-hidden rounded-xl border bg-muted/30 text-left shadow-sm transition hover:shadow-lg cursor-pointer select-none",
                      isSelected ? "ring-2 ring-primary/70" : ""
                    ].join(" ")}
                    style={{ 
                      width: `${width}px`,
                      height: `${ROW_HEIGHT}px`,
                      flexShrink: 0
                    }}
                    onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || hasSelection) {
                  toggleSelection(item.id);
                  return;
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const isItemSelected = selectedIds.has(item.id);
                const hasOtherSelections = selectedIds.size > 0;

                if (isItemSelected && hasOtherSelections) {
                  setMenu({ file: item, x: event.clientX, y: event.clientY, scope: "selection" });
                } else {
                  setMenu({ file: item, x: event.clientX, y: event.clientY, scope: "single" });
                }
                setMenuPos({ x: event.clientX, y: event.clientY });
              }}
            >
              <img
                src={imageUrl}
                alt={item.originalName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-80" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <div className="flex items-center gap-2 text-white">
                  <p className="flex-1 truncate text-sm font-semibold">
                    {item.originalName}
                  </p>
                    <span className="rounded-full bg-black/50 px-2 py-0.5 text-[11px]">
                      {visibilityLabel}
                    </span>
                    <FileAuditBadge audit={item.audit} />
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
              <a
                href={imageUrl}
                data-fancybox="gallery"
                data-caption={item.originalName}
                className="absolute inset-0"
                onClick={(e) => {
                  if (hasSelection) {
                    e.preventDefault();
                  }
                }}
              >
                <span className="sr-only">{t("grid.viewImage")}</span>
              </a>
              <span
                className={[
                  "absolute left-3 top-3 z-10 inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] pointer-events-auto",
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
                className="absolute right-3 top-3 z-10 rounded-md border border-white/40 bg-black/35 px-2 py-0.5 text-xs text-white/80 backdrop-blur transition hover:bg-black/50 pointer-events-auto"
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
                  {t("grid.deleting")}
                </div>
              )}
              {approvingAuditId === item.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                  {t("grid.approvingAudit")}
                </div>
              )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div ref={sentinelRef} className="h-6 w-full" />
      {isFetchingMore && (
        <p className="text-sm text-muted-foreground">{t("grid.loadingMore")}</p>
      )}

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

      <AlertDialog open={Boolean(pendingDeleteIds)} onOpenChange={(open) => !open && setPendingDeleteIds(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("grid.confirmDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("grid.confirmDeleteDescription", { label: pendingDeleteLabel || t("grid.selectedContent") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!pendingDeleteIds?.length) return;
                void executeDelete(pendingDeleteIds);
              }}
            >
              {t("admin.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
