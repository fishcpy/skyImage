import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteUserAccount, fetchUsers, toggleUserAdmin, updateUserStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/state/auth";
export function UserManagementPage() {
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((state) => state.user);
    const isSuperAdmin = currentUser?.isSuperAdmin;
    const { data: users, isLoading } = useQuery({
        queryKey: ["users"],
        queryFn: fetchUsers
    });
    const statusMutation = useMutation({
        mutationFn: ({ id, status }) => updateUserStatus(id, status),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast.success("状态已更新");
            // 如果修改的是当前用户，刷新当前用户信息
            if (currentUser && variables.id === currentUser.id) {
                useAuthStore.getState().refreshUser().catch((err) => {
                    console.error('[UserManagement] Failed to refresh current user:', err);
                });
            }
        },
        onError: (error) => toast.error(error.message)
    });
    const adminMutation = useMutation({
        mutationFn: ({ id, admin }) => toggleUserAdmin(id, admin),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast.success("角色已更新");
            // 如果修改的是当前用户，刷新当前用户信息
            if (currentUser && variables.id === currentUser.id) {
                useAuthStore.getState().refreshUser().catch((err) => {
                    console.error('[UserManagement] Failed to refresh current user:', err);
                });
            }
        },
        onError: (error) => toast.error(error.message)
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => deleteUserAccount(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users"] });
            toast.success("用户已删除");
        },
        onError: (error) => toast.error(error.message)
    });
    const handleDelete = (id) => {
        if (window.confirm("删除后该用户及其文件将被清理，确定继续吗？")) {
            deleteMutation.mutate(id);
        }
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u7528\u6237\u7BA1\u7406" }), _jsx("p", { className: "text-muted-foreground", children: "\u7EDF\u4E00\u67E5\u770B\u7528\u6237\u72B6\u6001\u3001\u89D2\u8272\u548C\u6240\u5C5E\u89D2\u8272\u7EC4\u3002" })] }), isSuperAdmin && (_jsx(Button, { asChild: true, children: _jsx(Link, { to: "/dashboard/admin/users/new", children: "\u65B0\u589E\u7528\u6237" }) }))] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u5168\u90E8\u7528\u6237" }) }), _jsx(CardContent, { children: isLoading ? (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "hidden md:block overflow-x-auto", children: _jsxs(Table, { children: [_jsx(TableHeader, { children: _jsxs(TableRow, { children: [_jsx(TableHead, { children: "\u7528\u6237" }), _jsx(TableHead, { children: "\u90AE\u7BB1" }), _jsx(TableHead, { children: "\u89D2\u8272\u7EC4" }), _jsx(TableHead, { children: "\u72B6\u6001" }), _jsx(TableHead, { children: "\u89D2\u8272" }), _jsx(TableHead, { className: "text-right", children: "\u64CD\u4F5C" })] }) }), _jsx(TableBody, { children: users?.map((user) => {
                                                    const manageable = Boolean(isSuperAdmin && !user.isSuperAdmin);
                                                    return (_jsxs(TableRow, { children: [_jsx(TableCell, { children: user.name }), _jsx(TableCell, { children: user.email }), _jsx(TableCell, { children: user.group?.name ?? "未分组" }), _jsx(TableCell, { children: _jsx(Badge, { variant: user.status === 1 ? "secondary" : "outline", children: user.status === 1 ? "正常" : "禁用" }) }), _jsx(TableCell, { children: user.isSuperAdmin ? (_jsx(Badge, { variant: "secondary", children: "\u8D85\u7EA7\u7BA1\u7406\u5458" })) : user.isAdmin ? (_jsx(Badge, { children: "\u7BA1\u7406\u5458" })) : (_jsx(Badge, { variant: "outline", children: "\u666E\u901A\u7528\u6237" })) }), _jsxs(TableCell, { className: "space-x-2 text-right", children: [_jsx(Button, { variant: "link", size: "sm", asChild: true, children: _jsx(Link, { to: `/dashboard/admin/users/${user.id}`, children: "\u8BE6\u60C5" }) }), manageable && (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "outline", onClick: () => statusMutation.mutate({
                                                                                    id: user.id,
                                                                                    status: user.status === 1 ? 0 : 1
                                                                                }), disabled: statusMutation.isPending, children: user.status === 1 ? "禁用" : "解禁" }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => adminMutation.mutate({
                                                                                    id: user.id,
                                                                                    admin: !user.isAdmin
                                                                                }), disabled: adminMutation.isPending, children: user.isAdmin ? "降级" : "升级" }), _jsx(Button, { size: "sm", variant: "destructive", onClick: () => handleDelete(user.id), disabled: deleteMutation.isPending, children: "\u5220\u9664" })] })), !manageable && (_jsx("span", { className: "text-xs text-muted-foreground", children: user.isSuperAdmin ? "受保护账户" : "仅超级管理员可操作" }))] })] }, user.id));
                                                }) })] }) }), _jsx("div", { className: "md:hidden space-y-3", children: users?.map((user) => {
                                        const manageable = Boolean(isSuperAdmin && !user.isSuperAdmin);
                                        return (_jsxs("div", { className: "rounded-lg border bg-card p-4 space-y-3", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-start justify-between gap-2", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "font-medium truncate", children: user.name }), _jsx("p", { className: "text-sm text-muted-foreground truncate", children: user.email })] }), user.isSuperAdmin ? (_jsx(Badge, { variant: "secondary", className: "flex-shrink-0", children: "\u8D85\u7EA7\u7BA1\u7406\u5458" })) : user.isAdmin ? (_jsx(Badge, { className: "flex-shrink-0", children: "\u7BA1\u7406\u5458" })) : (_jsx(Badge, { variant: "outline", className: "flex-shrink-0", children: "\u666E\u901A\u7528\u6237" }))] }), _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx("span", { className: "text-muted-foreground", children: "\u89D2\u8272\u7EC4:" }), _jsx("span", { children: user.group?.name ?? "未分组" }), _jsx(Badge, { variant: user.status === 1 ? "secondary" : "outline", className: "ml-auto", children: user.status === 1 ? "正常" : "禁用" })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Button, { variant: "outline", size: "sm", className: "flex-1", asChild: true, children: _jsx(Link, { to: `/dashboard/admin/users/${user.id}`, children: "\u8BE6\u60C5" }) }), manageable && (_jsxs(_Fragment, { children: [_jsx(Button, { size: "sm", variant: "outline", className: "flex-1", onClick: () => statusMutation.mutate({
                                                                        id: user.id,
                                                                        status: user.status === 1 ? 0 : 1
                                                                    }), disabled: statusMutation.isPending, children: user.status === 1 ? "禁用" : "解禁" }), _jsx(Button, { size: "sm", variant: "outline", className: "flex-1", onClick: () => adminMutation.mutate({
                                                                        id: user.id,
                                                                        admin: !user.isAdmin
                                                                    }), disabled: adminMutation.isPending, children: user.isAdmin ? "降级" : "升级" }), _jsx(Button, { size: "sm", variant: "destructive", className: "w-full", onClick: () => handleDelete(user.id), disabled: deleteMutation.isPending, children: "\u5220\u9664" })] })), !manageable && (_jsx("p", { className: "w-full text-xs text-center text-muted-foreground py-2", children: user.isSuperAdmin ? "受保护账户" : "仅超级管理员可操作" }))] })] }, user.id));
                                    }) })] })) })] })] }));
}
