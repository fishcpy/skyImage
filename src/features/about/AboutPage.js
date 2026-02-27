import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useQuery } from "@tanstack/react-query";
import { fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SplashScreen } from "@/components/SplashScreen";
export function AboutPage() {
    const { data, isLoading } = useQuery({
        queryKey: ["site-config"],
        queryFn: fetchSiteConfig
    });
    if (isLoading) {
        return _jsx(SplashScreen, { message: "\u52A0\u8F7D\u7AD9\u70B9\u4FE1\u606F..." });
    }
    const title = data?.title || "skyImage";
    const description = data?.description || "云端图床";
    const about = data?.about || "功能重构中，即将上线更多特性。";
    const version = data?.version || "未知版本";
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsxs("h1", { className: "text-2xl font-semibold", children: ["\u5173\u4E8E ", title] }), _jsx("p", { className: "text-muted-foreground", children: description })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u5F53\u524D\u7248\u672C" }) }), _jsx(CardContent, { className: "text-3xl font-semibold", children: version })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u9879\u76EE\u7B80\u4ECB" }) }), _jsx(CardContent, { className: "prose max-w-none text-sm text-muted-foreground", children: about })] })] }));
}
