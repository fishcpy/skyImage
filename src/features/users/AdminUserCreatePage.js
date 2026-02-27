import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { createUser } from "@/lib/api";
export function AdminUserCreatePage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "user"
    });
    const createMutation = useMutation({
        mutationFn: createUser,
        onSuccess: () => {
            toast.success("用户创建成功");
            queryClient.invalidateQueries({ queryKey: ["users"] });
            navigate("/dashboard/admin/users");
        },
        onError: (error) => toast.error(error.message)
    });
    const handleSubmit = (event) => {
        event.preventDefault();
        createMutation.mutate(form);
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { to: "/dashboard/admin/users", className: "text-primary", children: "\u7528\u6237\u7BA1\u7406" }), " ", "/ \u65B0\u589E\u7528\u6237"] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u521B\u5EFA\u65B0\u7528\u6237" }) }), _jsx(CardContent, { children: _jsxs("form", { className: "grid gap-4 md:grid-cols-2", onSubmit: handleSubmit, children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u6635\u79F0" }), _jsx(Input, { value: form.name, onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })), required: true })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u90AE\u7BB1" }), _jsx(Input, { type: "email", value: form.email, onChange: (e) => setForm((prev) => ({ ...prev, email: e.target.value })), required: true })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u521D\u59CB\u5BC6\u7801" }), _jsx(Input, { type: "password", value: form.password, onChange: (e) => setForm((prev) => ({ ...prev, password: e.target.value })), minLength: 8, required: true })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u89D2\u8272" }), _jsxs(Select, { value: form.role, onValueChange: (value) => setForm((prev) => ({
                                                ...prev,
                                                role: value
                                            })), children: [_jsx(SelectTrigger, { className: "h-10", children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u89D2\u8272" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "user", children: "\u666E\u901A\u7528\u6237" }), _jsx(SelectItem, { value: "admin", children: "\u7BA1\u7406\u5458" })] })] })] }), _jsxs("div", { className: "md:col-span-2 flex gap-3", children: [_jsx(Button, { type: "submit", disabled: createMutation.isPending, children: createMutation.isPending ? "创建中..." : "创建用户" }), _jsx(Button, { type: "button", variant: "ghost", onClick: () => navigate("/dashboard/admin/users"), disabled: createMutation.isPending, children: "\u53D6\u6D88" })] })] }) })] })] }));
}
