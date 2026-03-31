import { useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/state/auth";
import { useI18n } from "@/i18n";

const REFRESH_COOLDOWN_MS = 5000; // 5 seconds

export function CapacityMeter() {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshTime = useRef<number>(0);

  const { percent, usedLabel, totalLabel } = useMemo(() => {
    const capacity = user?.capacity ?? 0;
    const used = user?.usedCapacity ?? 0;
    const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
    
    // Format bytes to human readable format
    const format = (bytes: number) => {
      if (bytes <= 0) return "0 B";
      const units = ["B", "KB", "MB", "GB", "TB"];
      let idx = 0;
      let value = bytes;
      while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx++;
      }
      return `${value.toFixed(2)} ${units[idx]}`;
    };
    
    return {
      percent: pct,
      usedLabel: format(used),
      totalLabel: capacity > 0 ? format(capacity) : t("common.notConfigured")
    };
  }, [t, user]);

  const handleRefresh = async () => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;
    
    // Check if 5 seconds have passed since last refresh
    if (timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);
      toast.error(t("capacity.waitToRefresh", { seconds: remainingSeconds }));
      return;
    }
    
    setRefreshing(true);
    lastRefreshTime.current = now;
    try {
      await useAuthStore.getState().refreshUser();
    } finally {
      setRefreshing(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("capacity.usage")}</p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          title={t("capacity.refresh")}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="text-foreground">{usedLabel}</span> / {totalLabel}
      </p>
    </div>
  );
}
