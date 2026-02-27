import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { fetchAccountProfile, updateAccountProfile } from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
export function ProfileSettingsPage() {
    const setUser = useAuthStore((state) => state.setUser);
    const { data, isLoading } = useQuery({
        queryKey: ["account", "profile"],
        queryFn: fetchAccountProfile
    });
    const [form, setForm] = useState({
        name: "",
        email: "",
        url: "",
        password: "",
        defaultVisibility: "private",
        theme: "system"
    });
    useEffect(() => {
        if (data) {
            setForm({
                name: data.name ?? "",
                email: data.email ?? "",
                url: data.url ?? "",
                password: "",
                defaultVisibility: extractDefaultVisibility(data),
                theme: extractThemePreference(data)
            });
        }
    }, [data]);
    const mutation = useMutation({
        mutationFn: updateAccountProfile,
        onSuccess: (updated) => {
            setUser(updated);
            toast.success("已保存");
            setForm((prev) => ({ ...prev, password: "" }));
        },
        onError: (error) => toast.error(error.message)
    });
    if (isLoading) {
        return _jsx(SplashScreen, { message: "\u52A0\u8F7D\u4E2D..." });
    }
    const handleSubmit = () => {
        mutation.mutate({
            name: form.name,
            url: form.url,
            password: form.password,
            defaultVisibility: form.defaultVisibility,
            theme: form.theme
        });
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u4E2A\u4EBA\u8BBE\u7F6E" }), _jsx("p", { className: "text-muted-foreground", children: "\u66F4\u65B0\u6635\u79F0\u3001\u90AE\u7BB1\u4E0E\u8D26\u6237\u504F\u597D\u3002" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u57FA\u672C\u4FE1\u606F" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u6635\u79F0" }), _jsx(Input, { value: form.name, onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u90AE\u7BB1" }), _jsx(Input, { value: form.email, disabled: true })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u4E2A\u4EBA\u94FE\u63A5" }), _jsx(Input, { value: form.url, onChange: (e) => setForm((prev) => ({ ...prev, url: e.target.value })), placeholder: "https://example.com" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u65B0\u5BC6\u7801\uFF08\u53EF\u9009\uFF09" }), _jsx(Input, { type: "password", value: form.password, onChange: (e) => setForm((prev) => ({ ...prev, password: e.target.value })), placeholder: "\u81F3\u5C11 8 \u4F4D" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u9ED8\u8BA4\u4E0A\u4F20\u53EF\u89C1\u6027" }), _jsxs(Select, { value: form.defaultVisibility, onValueChange: (value) => setForm((prev) => ({
                                            ...prev,
                                            defaultVisibility: value
                                        })), children: [_jsx(SelectTrigger, { className: "h-10", children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u53EF\u89C1\u6027" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "private", children: "\u79C1\u6709" }), _jsx(SelectItem, { value: "public", children: "\u516C\u5F00" })] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u9ED8\u8BA4\u4E3B\u9898" }), _jsxs(Select, { value: form.theme, onValueChange: (value) => setForm((prev) => ({
                                            ...prev,
                                            theme: value
                                        })), children: [_jsx(SelectTrigger, { className: "h-10", children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u4E3B\u9898" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "system", children: "\u8DDF\u968F\u7CFB\u7EDF" }), _jsx(SelectItem, { value: "light", children: "\u6D45\u8272" }), _jsx(SelectItem, { value: "dark", children: "\u6DF1\u8272" })] })] })] }), _jsx(Button, { onClick: handleSubmit, disabled: mutation.isPending, children: mutation.isPending ? "保存中..." : "保存" })] })] })] }));
}
function extractDefaultVisibility(user) {
    const configs = user?.configs ??
        user?.Configs ??
        user?.preferences ??
        user?.preferences_json ??
        null;
    if (!configs)
        return "private";
    try {
        const parsed = typeof configs === "string" ? JSON.parse(configs) : configs;
        const raw = parsed?.default_visibility ?? parsed?.defaultVisibility ?? null;
        return raw === "public" ? "public" : "private";
    }
    catch {
        return "private";
    }
}
function extractThemePreference(user) {
    const configs = user?.configs ??
        user?.Configs ??
        user?.preferences ??
        user?.preferences_json ??
        null;
    if (!configs)
        return "system";
    try {
        const parsed = typeof configs === "string" ? JSON.parse(configs) : configs;
        const raw = parsed?.theme_preference ??
            parsed?.theme ??
            parsed?.themePreference;
        return raw === "light" || raw === "dark" ? raw : "system";
    }
    catch {
        return "system";
    }
}
