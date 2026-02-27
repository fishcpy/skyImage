import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { assignUserGroup, deleteUserAccount, fetchGroups, fetchUserDetail, toggleUserAdmin, updateUserStatus } from "@/lib/api";
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
    const isAdmin = currentUser?.isAdmin;
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
    const deleteMutation = useMutation({
        mutationFn: () => deleteUserAccount(userId),
        onSuccess: () => {
            toast.success("用户已删除");
            queryClient.invalidateQueries({ queryKey: ["users"] });
            navigate("/dashboard/admin/users");
        },
        onError: (error) => toast.error(error.message)
    });
    const handleGroupChange = (value) => {
        const next = value === "none" ? null : Number(value);
        setGroupId(value === "none" ? "none" : Number(value));
        groupMutation.mutate(next);
    };
    const handleDelete = () => {
        if (window.confirm("删除后该用户及其文件将被清理，确定继续吗？")) {
            deleteMutation.mutate();
        }
    };
    if (!user) {
        return (_jsxs("div", { className: "space-y-4", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { to: "/dashboard/admin/users", className: "text-primary", children: "\u7528\u6237\u7BA1\u7406" }), " ", "/ \u7F16\u8F91\u7528\u6237"] }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u6B63\u5728\u52A0\u8F7D..." })] }));
    }
    const isSuperAdmin = user.isSuperAdmin;
    const canModify = isAdmin && !isSuperAdmin;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { to: "/dashboard/admin/users", className: "text-primary", children: "\u7528\u6237\u7BA1\u7406" }), " ", "/ ", user.name] }), isSuperAdmin && (_jsx(Badge, { variant: "secondary", children: "\u53D7\u4FDD\u62A4\u8D26\u6237" }))] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u57FA\u672C\u4FE1\u606F" }) }), _jsx(CardContent, { className: "space-y-3", children: _jsxs("div", { className: "grid gap-3 sm:grid-cols-2", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6635\u79F0" }), _jsx("p", { className: "font-medium", children: user.name })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u90AE\u7BB1" }), _jsx("p", { className: "font-medium", children: user.email })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u89D2\u8272" }), _jsx("div", { children: user.isSuperAdmin ? (_jsx(Badge, { variant: "secondary", children: "\u8D85\u7EA7\u7BA1\u7406\u5458" })) : user.isAdmin ? (_jsx(Badge, { children: "\u7BA1\u7406\u5458" })) : (_jsx(Badge, { variant: "outline", children: "\u666E\u901A\u7528\u6237" })) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u72B6\u6001" }), _jsx("div", { children: _jsx(Badge, { variant: user.status === 1 ? "secondary" : "outline", children: user.status === 1 ? "正常" : "已禁用" }) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u5BB9\u91CF\u4F7F\u7528" }), _jsx("p", { className: "font-medium", children: formatBytes(user.usedCapacity ?? 0) })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "\u5BB9\u91CF\u4E0A\u9650" }), _jsx("p", { className: "font-medium", children: user.capacity && user.capacity > 0 ? formatBytes(user.capacity) : "未配置" })] })] }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u89D2\u8272\u7EC4" }) }), _jsxs(CardContent, { className: "space-y-3", children: [_jsxs(Select, { value: groupId === "none" ? "none" : String(groupId), onValueChange: handleGroupChange, disabled: !isAdmin, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u89D2\u8272\u7EC4" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "none", children: "\u672A\u5206\u914D" }), groups?.map((group) => (_jsx(SelectItem, { value: String(group.id), children: group.name }, group.id)))] })] }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u53D8\u66F4\u540E\u7ACB\u5373\u751F\u6548\uFF0C\u4E0A\u4F20\u7B56\u7565\u5C06\u6839\u636E\u89D2\u8272\u7EC4\u53EF\u7528\u7B56\u7565\u81EA\u52A8\u7B5B\u9009\u3002" })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u6743\u9650\u63A7\u5236" }) }), _jsxs(CardContent, { children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-between p-4 rounded-lg border", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: "\u8D26\u6237\u72B6\u6001" }), _jsx("p", { className: "text-sm text-muted-foreground", children: user.status === 1 ? "账户正常，可以登录和使用" : "账户已禁用，无法登录" })] }), canModify && (_jsx(Button, { variant: user.status === 1 ? "outline" : "default", onClick: () => statusMutation.mutate(user.status === 1 ? 0 : 1), disabled: statusMutation.isPending, children: user.status === 1 ? "禁用" : "启用" })), !canModify && (_jsx(Badge, { variant: "secondary", children: "\u4E0D\u53EF\u4FEE\u6539" }))] }), _jsxs("div", { className: "flex items-center justify-between p-4 rounded-lg border", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium", children: "\u7BA1\u7406\u5458\u6743\u9650" }), _jsx("p", { className: "text-sm text-muted-foreground", children: user.isAdmin ? "拥有管理后台访问权限" : "普通用户，无管理权限" })] }), canModify && (_jsx(Button, { variant: user.isAdmin ? "outline" : "default", onClick: () => adminMutation.mutate(!user.isAdmin), disabled: adminMutation.isPending, children: user.isAdmin ? "降级" : "升级" })), isSuperAdmin && (_jsx(Badge, { variant: "secondary", children: "\u8D85\u7EA7\u7BA1\u7406\u5458" }))] }), canModify && (_jsxs("div", { className: "flex items-center justify-between p-4 rounded-lg border border-destructive/50 bg-destructive/5", children: [_jsxs("div", { children: [_jsx("p", { className: "font-medium text-destructive", children: "\u5220\u9664\u8D26\u6237" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "\u5220\u9664\u540E\u8BE5\u7528\u6237\u53CA\u5176\u6240\u6709\u6587\u4EF6\u5C06\u88AB\u6C38\u4E45\u6E05\u7406\uFF0C\u6B64\u64CD\u4F5C\u4E0D\u53EF\u6062\u590D" })] }), _jsx(Button, { variant: "destructive", onClick: handleDelete, disabled: deleteMutation.isPending, children: "\u5220\u9664" })] }))] }), _jsx("div", { className: "mt-6 pt-6 border-t", children: _jsx(Button, { variant: "secondary", onClick: () => navigate("/dashboard/admin/users"), children: "\u8FD4\u56DE\u5217\u8868" }) })] })] })] }));
}
