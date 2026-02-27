import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { fetchInstallerStatus, runInstaller } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { useAuthStore } from "@/state/auth";
export function InstallerPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const clearAuth = useAuthStore((state) => state.clear);
    const [step, setStep] = useState(1); // 1: 数据库配置, 2: 站点信息
    const { data, isLoading } = useQuery({
        queryKey: ["installer"],
        queryFn: fetchInstallerStatus
    });
    const [form, setForm] = useState({
        databaseType: "sqlite",
        databasePath: "storage/data/skyImage.db",
        databaseHost: "localhost",
        databasePort: "3306",
        databaseName: "skyimage",
        databaseUser: "root",
        databasePassword: "",
        siteName: "skyImage",
        adminName: "Administrator",
        adminEmail: "",
        adminPassword: ""
    });
    const mutation = useMutation({
        mutationFn: runInstaller,
        onSuccess: () => {
            clearAuth();
            toast.success("安装完成");
            queryClient.invalidateQueries({ queryKey: ["installer"] });
            navigate("/login");
        },
        onError: (error) => toast.error(error.message)
    });
    if (isLoading) {
        return _jsx("div", { className: "p-6 text-muted-foreground", children: "\u68C0\u6D4B\u5B89\u88C5\u72B6\u6001..." });
    }
    if (data?.installed) {
        return (_jsxs(Card, { className: "max-w-xl mx-auto mt-20", children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u7CFB\u7EDF\u5DF2\u5B89\u88C5" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("p", { children: ["\u7248\u672C\uFF1A", data.version] }), _jsx(Button, { onClick: () => (window.location.href = "/login"), children: "\u524D\u5F80\u767B\u5F55" })] })] }));
    }
    return (_jsxs("div", { className: "mx-auto max-w-2xl space-y-6 py-10", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u5B89\u88C5\u7A0B\u5E8F" }), _jsx("p", { className: "text-muted-foreground", children: step === 1 ? "第一步：配置数据库" : "第二步：配置站点信息" })] }), step === 1 ? (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u6570\u636E\u5E93\u914D\u7F6E" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databaseType", children: "\u6570\u636E\u5E93\u7C7B\u578B" }), _jsxs(Select, { value: form.databaseType, onValueChange: (value) => setForm((prev) => ({ ...prev, databaseType: value })), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u6570\u636E\u5E93\u7C7B\u578B" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "sqlite", children: "SQLite\uFF08\u63A8\u8350\uFF09" }), _jsx(SelectItem, { value: "mysql", children: "MySQL" }), _jsx(SelectItem, { value: "postgres", children: "PostgreSQL" })] })] })] }), form.databaseType === "sqlite" && (_jsx(_Fragment, { children: _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databasePath", children: "\u6570\u636E\u5E93\u6587\u4EF6\u8DEF\u5F84" }), _jsx(Input, { id: "databasePath", value: form.databasePath, onChange: (e) => setForm((prev) => ({ ...prev, databasePath: e.target.value })), placeholder: "storage/data/skyImage.db" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "SQLite \u662F\u4E00\u4E2A\u8F7B\u91CF\u7EA7\u7684\u5D4C\u5165\u5F0F\u6570\u636E\u5E93\uFF0C\u65E0\u9700\u989D\u5916\u914D\u7F6E\uFF0C\u9002\u5408\u4E2A\u4EBA\u4F7F\u7528\u548C\u5C0F\u578B\u9879\u76EE\u3002" })] }) })), form.databaseType !== "sqlite" && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databaseHost", children: "\u6570\u636E\u5E93\u4E3B\u673A" }), _jsx(Input, { id: "databaseHost", value: form.databaseHost, onChange: (e) => setForm((prev) => ({ ...prev, databaseHost: e.target.value })), placeholder: "localhost" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databasePort", children: "\u7AEF\u53E3" }), _jsx(Input, { id: "databasePort", value: form.databasePort, onChange: (e) => setForm((prev) => ({ ...prev, databasePort: e.target.value })), placeholder: form.databaseType === "postgres" ? "5432" : "3306" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databaseName", children: "\u6570\u636E\u5E93\u540D\u79F0" }), _jsx(Input, { id: "databaseName", value: form.databaseName, onChange: (e) => setForm((prev) => ({ ...prev, databaseName: e.target.value })), placeholder: "skyimage" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databaseUser", children: "\u7528\u6237\u540D" }), _jsx(Input, { id: "databaseUser", value: form.databaseUser, onChange: (e) => setForm((prev) => ({ ...prev, databaseUser: e.target.value })), placeholder: "root" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "databasePassword", children: "\u5BC6\u7801" }), _jsx(Input, { id: "databasePassword", type: "password", value: form.databasePassword, onChange: (e) => setForm((prev) => ({ ...prev, databasePassword: e.target.value })) })] })] })), _jsx(Button, { className: "w-full", onClick: () => setStep(2), children: "\u4E0B\u4E00\u6B65" })] })] })) : (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u7AD9\u70B9\u4FE1\u606F" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "siteName", children: "\u7AD9\u70B9\u540D\u79F0" }), _jsx(Input, { id: "siteName", value: form.siteName, onChange: (e) => setForm((prev) => ({ ...prev, siteName: e.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "adminName", children: "\u7BA1\u7406\u5458\u6635\u79F0" }), _jsx(Input, { id: "adminName", value: form.adminName, onChange: (e) => setForm((prev) => ({ ...prev, adminName: e.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "adminEmail", children: "\u7BA1\u7406\u5458\u90AE\u7BB1" }), _jsx(Input, { id: "adminEmail", type: "email", value: form.adminEmail, onChange: (e) => setForm((prev) => ({ ...prev, adminEmail: e.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { htmlFor: "adminPassword", children: "\u7BA1\u7406\u5458\u5BC6\u7801(\u9700\u5927\u4E8E\u7B49\u4E8E8\u4F4D)" }), _jsx(Input, { id: "adminPassword", type: "password", value: form.adminPassword, onChange: (e) => setForm((prev) => ({
                                            ...prev,
                                            adminPassword: e.target.value
                                        })) })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { variant: "outline", className: "w-full", onClick: () => setStep(1), children: "\u4E0A\u4E00\u6B65" }), _jsx(Button, { className: "w-full", onClick: () => mutation.mutate(form), disabled: mutation.isPending, children: mutation.isPending ? "正在安装..." : "立即安装" })] })] })] }))] }));
}
