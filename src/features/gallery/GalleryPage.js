import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { fetchGalleryPublic } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";
import { normalizeFileUrl } from "@/lib/file-url";
export function GalleryPage() {
    const { data, isLoading } = useQuery({
        queryKey: ["gallery", "public"],
        queryFn: () => fetchGalleryPublic({ limit: 60 })
    });
    if (isLoading) {
        return _jsx(SplashScreen, { message: "\u6B63\u5728\u52A0\u8F7D\u753B\u5ECA..." });
    }
    const files = data ?? [];
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u56FE\u7247\u5E7F\u573A" }), _jsx("p", { className: "text-muted-foreground", children: "\u8FD9\u4E9B\u662F\u6700\u8FD1\u516C\u5F00\u5206\u4EAB\u7684\u56FE\u7247\u3002" })] }), files.length === 0 ? (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u8FD8\u6CA1\u6709\u516C\u5F00\u4F5C\u54C1" }) }), _jsx(CardContent, { className: "text-sm text-muted-foreground", children: "\u5728\u4E0A\u4F20\u65F6\u9009\u62E9\u201C\u516C\u5F00\u201D\u5373\u53EF\u5C06\u56FE\u7247\u5C55\u793A\u5728\u8FD9\u91CC\u3002" })] })) : (_jsx("div", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-4", children: files.map((file) => (_jsxs("a", { href: normalizeFileUrl(file.viewUrl || file.directUrl), target: "_blank", rel: "noreferrer", className: "group rounded-lg border bg-card transition hover:shadow-md", children: [_jsx("img", { src: normalizeFileUrl(file.viewUrl || file.directUrl), alt: file.originalName, className: "h-48 w-full rounded-t-lg object-cover" }), _jsxs("div", { className: "p-3", children: [_jsx("p", { className: "truncate text-sm font-medium group-hover:text-primary", children: file.originalName }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [(file.size / 1024).toFixed(1), " KB"] })] })] }, file.id))) }))] }));
}
