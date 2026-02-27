import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/state/auth";
const REFRESH_COOLDOWN_MS = 5000; // 5 seconds
export function CapacityMeter() {
    const user = useAuthStore((state) => state.user);
    const [refreshing, setRefreshing] = useState(false);
    const lastRefreshTime = useRef(0);
    const { percent, usedLabel, totalLabel } = useMemo(() => {
        const capacity = user?.capacity ?? 0;
        const used = user?.usedCapacity ?? 0;
        const pct = capacity > 0 ? Math.min(100, Math.round((used / capacity) * 100)) : 0;
        // Format bytes to human readable format
        const format = (bytes) => {
            if (bytes <= 0)
                return "0 B";
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
            totalLabel: capacity > 0 ? format(capacity) : "不限"
        };
    }, [user]);
    const handleRefresh = async () => {
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshTime.current;
        // Check if 5 seconds have passed since last refresh
        if (timeSinceLastRefresh < REFRESH_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeSinceLastRefresh) / 1000);
            toast.error(`请等待 ${remainingSeconds} 秒后再刷新`);
            return;
        }
        setRefreshing(true);
        lastRefreshTime.current = now;
        try {
            await useAuthStore.getState().refreshUser();
        }
        finally {
            setRefreshing(false);
        }
    };
    if (!user) {
        return null;
    }
    return (_jsxs("div", { className: "space-y-2 rounded-lg border p-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u5BB9\u91CF\u4F7F\u7528" }), _jsx("button", { onClick: handleRefresh, disabled: refreshing, className: "text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50", title: "\u5237\u65B0\u5BB9\u91CF\u4FE1\u606F", children: _jsx(RefreshCw, { className: `h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}` }) })] }), _jsx("div", { className: "h-2 w-full overflow-hidden rounded-full bg-muted", children: _jsx("div", { className: "h-full rounded-full bg-primary transition-all", style: { width: `${percent}%` } }) }), _jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx("span", { className: "text-foreground", children: usedLabel }), " / ", totalLabel] })] }));
}
