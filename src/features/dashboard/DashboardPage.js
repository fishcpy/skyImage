import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSiteConfig } from "@/lib/api";
const DEFAULT_DISABLED_NOTICE = "账户已被封禁，请联系管理员恢复访问。";
export function DashboardPage() {
    const user = useAuthStore((state) => state.user);
    const isDisabled = user?.status === 0;
    const { data: siteConfig } = useQuery({
        queryKey: ["site-config"],
        queryFn: fetchSiteConfig
    });
    const disabledNotice = siteConfig?.accountDisabledNotice?.trim() || DEFAULT_DISABLED_NOTICE;
    const formatBytes = (bytes) => {
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
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [isDisabled && (_jsxs("div", { className: "mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3", children: [_jsx("p", { className: "font-semibold text-destructive", children: "\u60A8\u7684\u8D26\u6237\u5DF2\u88AB\u5C01\u7981" }), _jsx("p", { className: "text-sm text-destructive/80", children: disabledNotice })] })), _jsxs("h1", { className: "text-2xl font-semibold", children: ["\u6B22\u8FCE\u56DE\u6765\uFF0C", user?.name ?? "用户"] }), _jsx("p", { className: "text-muted-foreground", children: "\u5FEB\u901F\u67E5\u770B\u4F60\u7684\u5BB9\u91CF\u5360\u7528\u3001\u6700\u8FD1\u4E0A\u4F20\u548C\u7CFB\u7EDF\u901A\u77E5\u3002" })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u5BB9\u91CF\u4E0A\u9650" }) }), _jsx(CardContent, { className: "text-3xl font-semibold", children: user?.capacity ? formatBytes(user.capacity) : "不限" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u5DF2\u4F7F\u7528" }) }), _jsx(CardContent, { className: "text-3xl font-semibold", children: formatBytes(user?.usedCapacity ?? 0) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u4ECA\u65E5\u72B6\u6001" }) }), _jsx(CardContent, { children: isDisabled ? (_jsx("p", { className: "text-sm text-destructive", children: disabledNotice })) : (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u4E00\u5207\u8FD0\u884C\u6B63\u5E38\uFF0C\u5FEB\u53BB\u4E0A\u4F20\u4F60\u7684\u4F5C\u54C1\u5427\u3002" })) })] })] })] }));
}
