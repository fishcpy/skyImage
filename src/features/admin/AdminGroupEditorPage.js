import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { assignUserGroup, fetchGroups, fetchUsers, saveGroup } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
const defaultGroupConfigs = {
    max_file_size: 10 * 1024 * 1024,
    max_capacity: 1024 * 1024 * 1024
};
export function AdminGroupEditorPage() {
    const { id } = useParams();
    const isEditing = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: groups } = useQuery({
        queryKey: ["admin", "groups"],
        queryFn: fetchGroups
    });
    const { data: users } = useQuery({
        queryKey: ["admin", "users"],
        queryFn: fetchUsers,
        enabled: isEditing
    });
    const [form, setForm] = useState({
        name: "",
        configs: { ...defaultGroupConfigs }
    });
    useEffect(() => {
        if (isEditing && groups) {
            const target = groups.find((item) => item.id === Number(id));
            if (target) {
                setForm({
                    ...target,
                    configs: {
                        max_file_size: target.configs?.max_file_size ?? defaultGroupConfigs.max_file_size,
                        max_capacity: target.configs?.max_capacity ?? defaultGroupConfigs.max_capacity
                    }
                });
            }
        }
        else if (!isEditing) {
            setForm({ name: "", configs: { ...defaultGroupConfigs } });
        }
    }, [groups, id, isEditing]);
    const saveMutation = useMutation({
        mutationFn: saveGroup,
        onSuccess: () => {
            toast.success("角色组已保存");
            queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
            // Refresh current user's capacity
            useAuthStore.getState().refreshUser().then(() => {
                console.log('[AdminGroupEditor] User refreshed after save');
            });
            navigate("/dashboard/admin/groups");
        },
        onError: (error) => toast.error(error.message)
    });
    const assignMutation = useMutation({
        mutationFn: ({ userId, groupId }) => assignUserGroup(userId, groupId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
            toast.success("成员已更新");
            // Refresh current user
            useAuthStore.getState().refreshUser().then(() => {
                console.log('[AdminGroupEditor] User refreshed after assign');
            });
        },
        onError: (error) => toast.error(error.message)
    });
    const handleSubmit = () => {
        if (!form.name)
            return;
        const payload = {
            id: form.id,
            name: form.name,
            isDefault: form.isDefault || false,
            configs: {
                max_file_size: form.configs?.max_file_size ?? defaultGroupConfigs.max_file_size,
                max_capacity: form.configs?.max_capacity ?? defaultGroupConfigs.max_capacity
            }
        };
        saveMutation.mutate(payload);
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { className: "text-primary", to: "/dashboard/admin/groups", children: "\u89D2\u8272\u7EC4\u5217\u8868" }), " ", "/ ", isEditing ? "编辑角色组" : "新增角色组"] }), _jsx("h1", { className: "text-2xl font-semibold", children: isEditing ? form.name : "新建角色组" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u57FA\u7840\u4FE1\u606F" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsx("div", { className: "grid gap-4 md:grid-cols-2", children: _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u540D\u79F0" }), _jsx(Input, { value: form.name || "", onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })) })] }) }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u6700\u5927\u5355\u6587\u4EF6 (MB)" }), _jsx(Input, { type: "number", value: form.configs?.max_file_size
                                                    ? (form.configs.max_file_size / 1024 / 1024).toString()
                                                    : "", onChange: (e) => setForm((prev) => ({
                                                    ...prev,
                                                    configs: {
                                                        ...prev.configs,
                                                        max_file_size: Number(e.target.value || 0) * 1024 * 1024
                                                    }
                                                })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u5BB9\u91CF\u4E0A\u9650 (GB)" }), _jsx(Input, { type: "number", value: form.configs?.max_capacity
                                                    ? (form.configs.max_capacity / 1024 / 1024 / 1024).toString()
                                                    : "", onChange: (e) => setForm((prev) => ({
                                                    ...prev,
                                                    configs: {
                                                        ...prev.configs,
                                                        max_capacity: Number(e.target.value || 0) * 1024 * 1024 * 1024
                                                    }
                                                })) })] })] }), _jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Checkbox, { id: "isDefault", checked: Boolean(form.isDefault), onCheckedChange: (checked) => {
                                            const actualValue = checked === 'indeterminate' ? false : checked;
                                            setForm((prev) => ({ ...prev, isDefault: actualValue }));
                                        } }), _jsx(Label, { htmlFor: "isDefault", className: "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", children: "\u9ED8\u8BA4\u7EC4" })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { onClick: handleSubmit, disabled: !form.name || saveMutation.isPending, children: saveMutation.isPending ? "保存中..." : "保存" }), _jsx(Button, { variant: "ghost", onClick: () => navigate("/dashboard/admin/groups"), disabled: saveMutation.isPending, children: "\u53D6\u6D88" })] })] })] }), isEditing && (_jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u6210\u5458\u7BA1\u7406" }) }), _jsxs(CardContent, { className: "space-y-3", children: [!users?.length && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u7528\u6237" })), users?.map((user) => {
                                const inGroup = user.groupId === Number(id);
                                return (_jsxs("div", { className: "flex items-center justify-between rounded-md border p-3", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium", children: [user.name, " \u00B7 ", user.email] }), _jsx("p", { className: "text-xs text-muted-foreground", children: user.isSuperAdmin ? "超级管理员" : user.isAdmin ? "管理员" : "普通用户" })] }), _jsx(Button, { size: "sm", variant: inGroup ? "secondary" : "outline", disabled: assignMutation.isPending, onClick: () => assignMutation.mutate({
                                                userId: user.id,
                                                groupId: inGroup ? null : Number(id)
                                            }), children: inGroup ? "移出本组" : "加入本组" })] }, user.id));
                            })] })] }))] }));
}
