import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { assignUserGroup, fetchGroups, fetchUserDetail, toggleUserAdmin, updateUserStatus } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/state/auth";
const formatBytes = (bytes) => {
    if (bytes <= 0)
        return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx++;
    }
    return `${value.toFixed(2)} ${units[idx]}`;
};
export function AdminUserDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((state) => state.user);
    const userId = Number(id);
    const { data: user, refetch } = useQuery({
        queryKey: ["admin", "user", userId],
        queryFn: () => fetchUserDetail(userId),
        enabled: Number.isFinite(userId)
    });
    const { data: groups } = useQuery({
        queryKey: ["admin", "groups"],
        queryFn: fetchGroups
    });
    const [groupId, setGroupId] = useState("none");
    useEffect(() => {
        if (user) {
            setGroupId(user.groupId ?? "none");
        }
    }, [user]);
    const statusMutation = useMutation({
        mutationFn: (status) => updateUserStatus(userId, status),
        onSuccess: () => {
            toast.success("状态已更新");
            queryClient.invalidateQueries({ queryKey: ["users"] });
            refetch();
            // 如果修改的是当前用户，刷新当前用户信息
            if (currentUser && userId === currentUser.id) {
                useAuthStore.getState().refreshUser().catch((err) => {
                    console.error('[AdminUserDetail] Failed to refresh current user:', err);
                });
            }
        },
        onError: (error) => toast.error(error.message)
    });
    const adminMutation = useMutation({
        mutationFn: (admin) => toggleUserAdmin(userId, admin),
        onSuccess: () => {
            toast.success("角色已更新");
            queryClient.invalidateQueries({ queryKey: ["users"] });
            refetch();
            // 如果修改的是当前用户，刷新当前用户信息
            if (currentUser && userId === currentUser.id) {
                useAuthStore.getState().refreshUser().catch((err) => {
                    console.error('[AdminUserDetail] Failed to refresh current user:', err);
                });
            }
        },
        onError: (error) => toast.error(error.message)
    });
    const groupMutation = useMutation({
        mutationFn: (value) => assignUserGroup(userId, value),
        onSuccess: () => {
            toast.success("角色组已更新");
            queryClient.invalidateQueries({ queryKey: ["users"] });
            refetch();
        },
        onError: (error) => {
            toast.error(error.message);
            refetch();
        }
    });
    const handleGroupChange = (value) => {
        const next = value === "none" ? null : Number(value);
        setGroupId(value === "none" ? "none" : Number(value));
        groupMutation.mutate(next);
    };
    if (!user) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { to: "/dashboard/admin/users", className: "text-primary", children: "\u7528\u6237\u7BA1\u7406" }), " ", "/ \u7528\u6237\u8BE6\u60C5"] }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u6B63\u5728\u52A0\u8F7D..." })] }));
    }
    const immutable = user.isSuperAdmin;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { to: "/dashboard/admin/users", className: "text-primary", children: "\u7528\u6237\u7BA1\u7406" }), " ", "/ ", user.name] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u57FA\u672C\u4FE1\u606F" }) }), _jsxs(CardContent, { className: "space-y-2", children: [_jsxs("p", { children: ["\u6635\u79F0\uFF1A", user.name] }), _jsxs("p", { children: ["\u90AE\u7BB1\uFF1A", user.email] }), _jsxs("p", { children: ["\u89D2\u8272\uFF1A", user.isSuperAdmin ? "超级管理员" : user.isAdmin ? "管理员" : "普通用户"] }), _jsxs("p", { children: ["\u72B6\u6001\uFF1A", user.status === 1 ? "正常" : "已禁用"] }), _jsxs("p", { children: ["\u5BB9\u91CF\u4F7F\u7528\uFF1A", formatBytes(user.usedCapacity ?? 0), " /", " ", user.capacity && user.capacity > 0 ? formatBytes(user.capacity) : "未配置"] })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u89D2\u8272\u7EC4" }) }), _jsxs(CardContent, { className: "space-y-3", children: [_jsxs(Select, { value: groupId === "none" ? "none" : String(groupId), onValueChange: handleGroupChange, disabled: immutable, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u89D2\u8272\u7EC4" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "none", children: "\u672A\u5206\u914D" }), groups?.map((group) => (_jsx(SelectItem, { value: String(group.id), children: group.name }, group.id)))] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u53D8\u66F4\u540E\u7ACB\u5373\u751F\u6548\uFF0C\u4E0A\u4F20\u7B56\u7565\u5C06\u6839\u636E\u89D2\u8272\u7EC4\u53EF\u7528\u7B56\u7565\u81EA\u52A8\u7B5B\u9009\u3002" })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u6743\u9650\u63A7\u5236" }) }), _jsxs(CardContent, { className: "flex flex-wrap gap-3", children: [!immutable && (_jsx(Button, { variant: "outline", onClick: () => statusMutation.mutate(user.status === 1 ? 0 : 1), disabled: statusMutation.isPending, children: user.status === 1 ? "禁用账户" : "启用账户" })), !user.isSuperAdmin && (_jsx(Button, { variant: "ghost", onClick: () => adminMutation.mutate(!user.isAdmin), disabled: adminMutation.isPending, children: user.isAdmin ? "降级为普通用户" : "升级为管理员" })), _jsx(Button, { variant: "secondary", onClick: () => navigate("/dashboard/admin/users"), children: "\u8FD4\u56DE\u5217\u8868" })] })] })] }));
}
