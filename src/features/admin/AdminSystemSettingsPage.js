import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Send, Shield, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { fetchSystemSettings, updateSystemSettings, testSmtpEmail, testTurnstileConfig } from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { Turnstile } from "@/components/Turnstile";
import { loadTurnstileScript } from "@/lib/turnstile";
export function AdminSystemSettingsPage() {
    const queryClient = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: ["admin", "system-settings"],
        queryFn: fetchSystemSettings
    });
    const [form, setForm] = useState({
        siteTitle: "",
        siteDescription: "",
        about: "",
        enableGallery: true,
        enableApi: true,
        smtpHost: "",
        smtpPort: "",
        smtpUsername: "",
        smtpPassword: "",
        smtpSecure: false,
        enableRegisterVerify: false,
        enableLoginNotification: false,
        turnstileSiteKey: "",
        turnstileSecretKey: "",
        enableTurnstile: false,
        accountDisabledNotice: ""
    });
    const [turnstileVerified, setTurnstileVerified] = useState(false);
    const [turnstileLastVerifiedAt, setTurnstileLastVerifiedAt] = useState(null);
    const [showTurnstileTester, setShowTurnstileTester] = useState(false);
    const [turnstileReady, setTurnstileReady] = useState(false);
    const [turnstileScriptError, setTurnstileScriptError] = useState(null);
    const [testEmail, setTestEmail] = useState("");
    const [initialForm, setInitialForm] = useState(null);
    // Calculate if form is dirty - must be before any conditional returns
    const isFormDirty = useMemo(() => {
        if (!initialForm) {
            return false;
        }
        const keys = Object.keys(initialForm);
        return keys.some((key) => initialForm[key] !== form[key]);
    }, [initialForm, form]);
    useEffect(() => {
        if (data) {
            const { turnstileVerified: verified, turnstileLastVerifiedAt, ...rest } = data;
            setForm(rest);
            setInitialForm(rest);
            setTurnstileVerified(verified);
            setTurnstileLastVerifiedAt(turnstileLastVerifiedAt || null);
            setShowTurnstileTester(false);
            setTurnstileReady(false);
            setTurnstileScriptError(null);
        }
    }, [data]);
    const mutation = useMutation({
        mutationFn: updateSystemSettings,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["site-config"] });
            queryClient.invalidateQueries({ queryKey: ["site-meta"] });
            queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
            toast.success("设置已更新");
        },
        onError: (error) => toast.error(error.message)
    });
    const testEmailMutation = useMutation({
        mutationFn: testSmtpEmail,
        onSuccess: (data) => {
            if (data.success) {
                toast.success("测试邮件发送成功！请检查收件箱");
                setTestEmail(""); // 清空测试邮箱输入
            }
            else {
                toast.error(data.message || "测试邮件发送失败");
            }
        },
        onError: (error) => toast.error(error.message)
    });
    const testTurnstileMutation = useMutation({
        mutationFn: testTurnstileConfig,
        onSuccess: (result) => {
            if (result.success) {
                toast.success("Turnstile 配置验证通过");
                setTurnstileVerified(true);
                setTurnstileLastVerifiedAt(result.verifiedAt || new Date().toISOString());
                setShowTurnstileTester(false);
            }
            else {
                setTurnstileVerified(false);
                toast.error(result.message || "Turnstile 验证失败，请重试");
            }
        },
        onError: (error) => {
            setTurnstileVerified(false);
            toast.error(error.message);
        }
    });
    if (isLoading) {
        return _jsx(SplashScreen, { message: "\u52A0\u8F7D\u7CFB\u7EDF\u8BBE\u7F6E..." });
    }
    if (error && !data) {
        const message = error.message === "account disabled"
            ? "当前账户已被封禁，无法访问系统设置。"
            : error.message;
        return (_jsx("div", { className: "space-y-4", children: _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u65E0\u6CD5\u52A0\u8F7D\u7CFB\u7EDF\u8BBE\u7F6E" }) }), _jsx(CardContent, { children: _jsx("p", { className: "text-sm text-destructive", children: message }) })] }) }));
    }
    const handleChange = (field, value) => {
        const actualValue = value === "indeterminate" ? false : value;
        if (field === "turnstileSiteKey" || field === "turnstileSecretKey") {
            setTurnstileVerified(false);
            setTurnstileLastVerifiedAt(null);
        }
        if (field === "enableTurnstile" && actualValue === true && !turnstileVerified) {
            toast.error("请先完成下方的 Turnstile 测试并验证成功后再启用登录/注册人机验证");
            return;
        }
        setForm((prev) => ({ ...prev, [field]: actualValue }));
    };
    const startTurnstileTest = () => {
        if (!form.turnstileSiteKey || !form.turnstileSecretKey) {
            toast.error("请先填写完整的 Site Key 和 Secret Key");
            return;
        }
        setShowTurnstileTester(true);
        setTurnstileReady(false);
        setTurnstileScriptError(null);
        loadTurnstileScript()
            .then(() => setTurnstileReady(true))
            .catch((err) => {
            setTurnstileScriptError(err.message);
            toast.error("加载 Turnstile 组件失败，请检查网络环境");
        });
    };
    const handleTurnstileVerify = (token) => {
        if (!form.turnstileSiteKey || !form.turnstileSecretKey) {
            toast.error("Turnstile 配置不完整");
            return;
        }
        testTurnstileMutation.mutate({
            siteKey: form.turnstileSiteKey,
            secretKey: form.turnstileSecretKey,
            token
        });
    };
    const handleTestEmail = () => {
        if (!testEmail) {
            toast.error("请输入测试邮箱地址");
            return;
        }
        if (!form.smtpHost || !form.smtpPort || !form.smtpUsername) {
            toast.error("请先填写完整的 SMTP 配置");
            return;
        }
        testEmailMutation.mutate({
            testEmail,
            smtpHost: form.smtpHost,
            smtpPort: form.smtpPort,
            smtpUsername: form.smtpUsername,
            smtpPassword: form.smtpPassword,
            smtpSecure: form.smtpSecure
        });
    };
    const lastVerifiedText = turnstileLastVerifiedAt
        ? new Date(turnstileLastVerifiedAt).toLocaleString()
        : "尚未验证";
    const canTestTurnstile = Boolean(form.turnstileSiteKey && form.turnstileSecretKey);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u7CFB\u7EDF\u8BBE\u7F6E" }), _jsx("p", { className: "text-muted-foreground", children: "\u4FEE\u6539\u7AD9\u70B9\u6807\u9898\u548C SMTP \u53C2\u6570\u3002" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u7AD9\u70B9\u4FE1\u606F" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u7AD9\u70B9\u6807\u9898" }), _jsx(Input, { value: form.siteTitle, onChange: (e) => handleChange("siteTitle", e.target.value) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u63CF\u8FF0" }), _jsx(Input, { value: form.siteDescription, onChange: (e) => handleChange("siteDescription", e.target.value) })] }), _jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "enableGallery", checked: form.enableGallery, onCheckedChange: (checked) => handleChange("enableGallery", checked) }), _jsx(Label, { htmlFor: "enableGallery", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u5F00\u542F\u753B\u5ECA" })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "enableApi", checked: form.enableApi, onCheckedChange: (checked) => handleChange("enableApi", checked) }), _jsx(Label, { htmlFor: "enableApi", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u5F00\u542F API" })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u5C01\u7981\u8D26\u6237\u63D0\u793A\u8BED" }), _jsx(Textarea, { value: form.accountDisabledNotice, onChange: (e) => handleChange("accountDisabledNotice", e.target.value), minLength: 4, maxLength: 200, rows: 3, placeholder: "\u8D26\u6237\u5DF2\u88AB\u5C01\u7981\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u6062\u590D\u8BBF\u95EE\u3002" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u8BE5\u6587\u6848\u4F1A\u5C55\u793A\u5728\u88AB\u7981\u7528\u8D26\u6237\u7684\u4EEA\u8868\u76D8\u9876\u90E8\u548C\u72B6\u6001\u5361\u7247\u4E0A\u3002" })] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "SMTP \u914D\u7F6E" }) }), _jsxs(CardContent, { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Host" }), _jsx(Input, { value: form.smtpHost, onChange: (e) => handleChange("smtpHost", e.target.value) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "Port" }), _jsx(Input, { value: form.smtpPort, onChange: (e) => handleChange("smtpPort", e.target.value) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u7528\u6237\u540D" }), _jsx(Input, { value: form.smtpUsername, onChange: (e) => handleChange("smtpUsername", e.target.value) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u5BC6\u7801 / \u6388\u6743\u7801" }), _jsx(Input, { type: "password", value: form.smtpPassword, onChange: (e) => handleChange("smtpPassword", e.target.value) })] }), _jsxs("div", { className: "md:col-span-2 space-y-4", children: [_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "smtpSecure", checked: form.smtpSecure, onCheckedChange: (checked) => handleChange("smtpSecure", checked) }), _jsx(Label, { htmlFor: "smtpSecure", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u542F\u7528 TLS/SSL" })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "enableRegisterVerify", checked: form.enableRegisterVerify, onCheckedChange: (checked) => handleChange("enableRegisterVerify", checked) }), _jsx(Label, { htmlFor: "enableRegisterVerify", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u542F\u7528\u6CE8\u518C\u90AE\u4EF6\u9A8C\u8BC1" })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "enableLoginNotification", checked: form.enableLoginNotification, onCheckedChange: (checked) => handleChange("enableLoginNotification", checked) }), _jsx(Label, { htmlFor: "enableLoginNotification", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u767B\u5F55\u90AE\u4EF6\u63D0\u9192" })] })] }), _jsx("div", { className: "md:col-span-2 mt-4 border-t pt-4", children: _jsxs("div", { className: "space-y-2", children: [_jsxs(Label, { className: "flex items-center gap-2", children: [_jsx(Mail, { className: "h-4 w-4" }), "\u6D4B\u8BD5\u90AE\u4EF6\u53D1\u9001"] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Input, { type: "email", placeholder: "\u8F93\u5165\u6D4B\u8BD5\u90AE\u7BB1\u5730\u5740", value: testEmail, onChange: (e) => setTestEmail(e.target.value), className: "flex-1" }), _jsxs(Button, { type: "button", variant: "outline", onClick: handleTestEmail, disabled: testEmailMutation.isPending, children: [_jsx(Send, { className: "h-4 w-4 mr-2" }), testEmailMutation.isPending ? "发送中..." : "发送测试邮件"] })] })] }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsxs(CardTitle, { className: "flex items-center gap-2", children: [_jsx(Shield, { className: "h-5 w-5" }), "\u4EBA\u673A\u9A8C\u8BC1 (Turnstile)"] }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u7AD9\u70B9\u5BC6\u94A5 (Site Key)" }), _jsx(Input, { value: form.turnstileSiteKey, onChange: (e) => handleChange("turnstileSiteKey", e.target.value), placeholder: "0x4AAAAAAA..." }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u7528\u4E8E\u5BA2\u6237\u7AEF\u6E32\u67D3\u9A8C\u8BC1\u7EC4\u4EF6" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u5BC6\u94A5 (Secret Key)" }), _jsx(Input, { type: "password", value: form.turnstileSecretKey, onChange: (e) => handleChange("turnstileSecretKey", e.target.value), placeholder: "0x4AAAAAAA..." }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u7528\u4E8E\u670D\u52A1\u7AEF\u9A8C\u8BC1\uFF0C\u8BF7\u59A5\u5584\u4FDD\u7BA1" })] }), _jsxs("div", { className: "flex items-start space-x-3", children: [_jsx(Checkbox, { id: "enableTurnstile", checked: form.enableTurnstile, onCheckedChange: (checked) => handleChange("enableTurnstile", checked) }), _jsxs("div", { children: [_jsx(Label, { htmlFor: "enableTurnstile", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u542F\u7528 Turnstile \u4EBA\u673A\u9A8C\u8BC1" }), _jsx("p", { className: "text-xs text-muted-foreground mt-1", children: "\u5F00\u542F\u540E\u767B\u5F55\u4E0E\u6CE8\u518C\u6D41\u7A0B\u4F1A\u5F3A\u5236\u8FDB\u884C Turnstile \u6821\u9A8C" })] })] }), _jsxs("div", { className: "rounded-md border border-dashed p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: "\u6D4B\u8BD5\u72B6\u6001" }), _jsx("p", { className: "text-xs text-muted-foreground", children: turnstileVerified
                                                            ? `已通过测试：${lastVerifiedText}`
                                                            : "尚未验证，启用前必须先完成测试" })] }), turnstileVerified ? (_jsx(CheckCircle2, { className: "h-5 w-5 text-green-500" })) : (_jsx(AlertTriangle, { className: "h-5 w-5 text-amber-500" }))] }), _jsxs("div", { className: "flex flex-col gap-2", children: [_jsx(Button, { type: "button", variant: "outline", onClick: startTurnstileTest, disabled: !canTestTurnstile || testTurnstileMutation.isPending, className: "justify-center", children: testTurnstileMutation.isPending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), "\u6B63\u5728\u9A8C\u8BC1..."] })) : showTurnstileTester ? ("重新加载测试") : turnstileVerified ? ("重新测试配置") : ("开始测试配置") }), !canTestTurnstile && (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u8BF7\u5148\u586B\u5199 Site Key \u4E0E Secret Key" }))] }), showTurnstileTester && (_jsxs("div", { className: "rounded-md border border-dashed p-4 text-center space-y-3", children: [!turnstileReady && !turnstileScriptError && (_jsxs("div", { className: "flex items-center justify-center gap-2 text-sm text-muted-foreground", children: [_jsx(Loader2, { className: "h-4 w-4 animate-spin" }), "\u6B63\u5728\u52A0\u8F7D Turnstile \u7EC4\u4EF6..."] })), turnstileScriptError && (_jsx("p", { className: "text-sm text-destructive", children: turnstileScriptError })), turnstileReady && !turnstileScriptError && (_jsxs(_Fragment, { children: [_jsx("div", { className: "flex justify-center", children: _jsx(Turnstile, { siteKey: form.turnstileSiteKey, onVerify: handleTurnstileVerify, onError: () => {
                                                                toast.error("Turnstile 组件出现错误，请重试");
                                                            }, onExpire: () => { } }) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u9A8C\u8BC1\u6210\u529F\u540E\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u63D0\u4EA4\u6D4B\u8BD5\u8BF7\u6C42" })] }))] }))] }), _jsxs("div", { className: "rounded-md bg-muted p-3 text-sm", children: [_jsx("p", { className: "font-medium mb-1", children: "\u914D\u7F6E\u8BF4\u660E\uFF1A" }), _jsxs("ul", { className: "list-disc list-inside space-y-1 text-muted-foreground", children: [_jsxs("li", { children: ["\u524D\u5F80", " ", _jsx("a", { href: "https://dash.cloudflare.com/?to=/:account/turnstile", target: "_blank", rel: "noopener noreferrer", className: "text-primary hover:underline", children: "Cloudflare Turnstile" }), " ", "\u521B\u5EFA\u7AD9\u70B9"] }), _jsx("li", { children: "\u83B7\u53D6\u7AD9\u70B9\u5BC6\u94A5\u548C\u5BC6\u94A5\u540E\u586B\u5165\u4E0A\u65B9" }), _jsx("li", { children: "\u542F\u7528\u540E\u5C06\u5728\u767B\u5F55\u548C\u6CE8\u518C\u9875\u9762\u663E\u793A\u9A8C\u8BC1" }), _jsxs("li", { children: ["\u53C2\u8003\u6587\u6863\uFF1A", _jsx("a", { href: "https://developers.cloudflare.com/turnstile/", target: "_blank", rel: "noopener noreferrer", className: "text-primary hover:underline", children: "Turnstile \u6587\u6863" })] })] })] })] })] }), _jsxs("div", { className: "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", children: [_jsx("p", { className: "text-xs text-muted-foreground", children: isFormDirty ? "有未保存的更改" : "未检测到配置更改" }), _jsx(Button, { onClick: () => mutation.mutate(form), disabled: mutation.isPending || !isFormDirty, children: mutation.isPending ? "保存中..." : "保存所有更改" })] })] }));
}
