import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { login, fetchHasUsers } from "@/lib/api";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Turnstile } from "@/components/Turnstile";
export function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const token = useAuthStore((state) => state.token);
    const setAuth = useAuthStore((state) => state.setAuth);
    const [form, setForm] = useState({ email: "", password: "" });
    const [turnstileToken, setTurnstileToken] = useState("");
    const [turnstileReady, setTurnstileReady] = useState(false);
    const { data: hasUsers, isLoading: checkingUsers, error, refetch } = useQuery({
        queryKey: ["auth", "has-users"],
        queryFn: fetchHasUsers
    });
    const { data: turnstileConfig } = useQuery({
        queryKey: ["turnstile-config"],
        queryFn: fetchTurnstileConfig,
    });
    // Load Turnstile script when enabled
    useEffect(() => {
        if (turnstileConfig?.enabled && turnstileConfig.siteKey) {
            loadTurnstileScript()
                .then(() => setTurnstileReady(true))
                .catch((err) => {
                console.error("Failed to load Turnstile:", err);
                toast.error("加载人机验证失败");
            });
        }
    }, [turnstileConfig]);
    const mutation = useMutation({
        mutationFn: login,
        onSuccess: (data) => {
            setAuth(data);
            toast.success("登录成功");
            const redirect = location.state?.from?.pathname ?? "/dashboard";
            navigate(redirect, { replace: true });
        },
        onError: (error) => {
            // 汉化错误消息
            let message = error.message;
            if (message === "account disabled") {
                message = "账户已被禁用";
            }
            else if (message === "invalid credentials") {
                message = "邮箱/密码不正确";
            }
            else if (message === "turnstile token required") {
                message = "请完成人机验证";
            }
            else if (message === "turnstile verification failed") {
                message = "人机验证失败，请重试";
            }
            toast.error(message);
            // Reset Turnstile on error
            setTurnstileToken("");
        }
    });
    const handleLogin = () => {
        // 验证密码长度
        if (form.password.length < 8) {
            toast.error("密码必须至少8位");
            return;
        }
        // Check Turnstile token if enabled
        if (turnstileConfig?.enabled && !turnstileToken) {
            toast.error("请完成人机验证");
            return;
        }
        mutation.mutate({ ...form, turnstileToken });
    };
    if (token) {
        return _jsx(Navigate, { to: "/dashboard", replace: true });
    }
    if (!checkingUsers && hasUsers === false) {
        return _jsx(Navigate, { to: "/installer", replace: true });
    }
    if (error) {
        return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center", children: [_jsx("p", { className: "text-lg font-semibold", children: "\u65E0\u6CD5\u8FDE\u63A5\u540E\u7AEF\u670D\u52A1" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u8BF7\u786E\u8BA4 Go API \u5DF2\u542F\u52A8\u5E76\u53EF\u901A\u8FC7 /api \u8BBF\u95EE\u3002" }), _jsx(Button, { onClick: () => refetch(), children: "\u91CD\u8BD5\u68C0\u6D4B" })] }));
    }
    return (_jsx("div", { className: "flex min-h-screen items-center justify-center bg-muted/30 p-4", children: _jsxs(Card, { className: "w-full max-w-md", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u7BA1\u7406\u5458\u767B\u5F55" }) }), _jsxs(CardContent, { className: "space-y-4", children: [checkingUsers && (_jsx("div", { className: "rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground", children: "\u6B63\u5728\u68C0\u6D4B\u7CFB\u7EDF\u72B6\u6001..." })), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u90AE\u7BB1" }), _jsx(Input, { type: "email", value: form.email, onChange: (event) => setForm((prev) => ({ ...prev, email: event.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u5BC6\u7801" }), _jsx(Input, { type: "password", value: form.password, onChange: (event) => setForm((prev) => ({ ...prev, password: event.target.value })) })] }), turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (_jsx("div", { className: "flex justify-center", children: _jsx(Turnstile, { siteKey: turnstileConfig.siteKey, onVerify: setTurnstileToken, onError: () => {
                                    setTurnstileToken("");
                                    toast.error("人机验证出错，请刷新页面重试");
                                }, onExpire: () => {
                                    setTurnstileToken("");
                                    toast.warning("人机验证已过期，请重新验证");
                                } }) })), _jsx(Button, { className: "w-full", onClick: handleLogin, disabled: mutation.isPending || checkingUsers, children: mutation.isPending ? "登录中..." : "登录" })] })] }) }));
}
