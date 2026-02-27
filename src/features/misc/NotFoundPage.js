import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
export function NotFoundPage({ homePath = "/dashboard" }) {
    return (_jsxs("div", { className: "flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center", children: [_jsxs("div", { children: [_jsx("p", { className: "text-6xl font-bold text-primary", children: "404" }), _jsx("p", { className: "mt-2 text-lg font-semibold", children: "\u9875\u9762\u4E0D\u5B58\u5728" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u9875\u9762\u53EF\u80FD\u5DF2\u7ECF\u88AB\u5220\u9664\u6216\u5730\u5740\u8F93\u5165\u6709\u8BEF\u3002" })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { asChild: true, children: _jsx(Link, { to: homePath, children: "\u8FD4\u56DE\u4EEA\u8868\u76D8" }) }), _jsx(Button, { variant: "ghost", asChild: true, children: _jsx(Link, { to: "/login", children: "\u91CD\u65B0\u767B\u5F55" }) })] })] }));
}
