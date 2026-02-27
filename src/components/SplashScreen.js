import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SplashScreen({ message }) {
    return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground", children: [_jsx("div", { className: "h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" }), message && _jsx("p", { className: "text-sm text-muted-foreground", children: message })] }));
}
