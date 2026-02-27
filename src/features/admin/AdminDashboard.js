import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { Activity, HardDrive, Users } from "lucide-react";
import { fetchAdminMetrics } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export function AdminConsolePage() {
    const { data, isLoading } = useQuery({
        queryKey: ["admin-metrics"],
        queryFn: fetchAdminMetrics
    });
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
    if (isLoading) {
        return _jsx("div", { children: "\u52A0\u8F7D\u4EEA\u8868\u76D8\u6570\u636E..." });
    }
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u7BA1\u7406\u9762\u677F" }), _jsx("p", { className: "text-muted-foreground", children: "\u76D1\u63A7\u7528\u6237\u3001\u6587\u4EF6\u4E0E\u7CFB\u7EDF\u914D\u7F6E\u72B6\u6001\u3002" })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [_jsx(StatCard, { title: "\u6D3B\u8DC3\u7528\u6237", value: data?.userCount ?? 0, icon: _jsx(Users, { className: "h-4 w-4 text-muted-foreground" }) }), _jsx(StatCard, { title: "\u6587\u4EF6\u6570\u91CF", value: data?.fileCount ?? 0, icon: _jsx(Activity, { className: "h-4 w-4 text-muted-foreground" }) }), _jsx(StatCard, { title: "\u5B58\u50A8\u4F7F\u7528", value: formatBytes(data?.storageUsed ?? 0), icon: _jsx(HardDrive, { className: "h-4 w-4 text-muted-foreground" }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u6700\u8FD1\u4E0A\u4F20" }) }), _jsx(CardContent, { className: "space-y-3", children: data?.recentUploads?.length ? (data.recentUploads.map((file) => (_jsxs("div", { className: "flex items-center justify-between rounded-md border px-3 py-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: file.originalName }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [file.mimeType, " \u00B7 ", new Date(file.createdAt).toLocaleString()] })] }), _jsx(Badge, { variant: file.visibility === "public" ? "default" : "secondary", children: file.visibility === "public" ? "公开" : "私有" })] }, file.id)))) : (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u4E0A\u4F20\u8BB0\u5F55" })) })] })] }));
}
function StatCard({ title, value, icon }) {
    return (_jsxs(Card, { children: [_jsxs(CardHeader, { className: "flex flex-row items-center justify-between space-y-0 pb-2", children: [_jsx(CardTitle, { className: "text-sm font-medium text-muted-foreground", children: title }), icon] }), _jsx(CardContent, { children: _jsx("div", { className: "text-2xl font-bold", children: value }) })] }));
}
