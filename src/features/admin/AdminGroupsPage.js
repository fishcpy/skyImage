import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchGroups, deleteGroup } from "@/lib/api";
export function AdminGroupsPage() {
    const queryClient = useQueryClient();
    const { data: groups, isLoading } = useQuery({
        queryKey: ["admin", "groups"],
        queryFn: fetchGroups
    });
    const removeMutation = useMutation({
        mutationFn: deleteGroup,
        onSuccess: () => {
            toast.success("已删除角色组");
            queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
        },
        onError: (error) => toast.error(error.message)
    });
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u89D2\u8272\u7EC4\u7BA1\u7406" }), _jsx("p", { className: "text-muted-foreground", children: "\u7BA1\u7406\u4E0A\u4F20\u9650\u5236\u4E0E\u5BB9\u91CF\u3002" })] }), _jsx(Button, { asChild: true, children: _jsx(Link, { to: "/dashboard/admin/groups/new", children: "\u65B0\u589E\u89D2\u8272\u7EC4" }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u89D2\u8272\u7EC4\u5217\u8868" }) }), _jsxs(CardContent, { className: "space-y-3", children: [isLoading && _jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." }), !isLoading && !groups?.length && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u672A\u914D\u7F6E\u89D2\u8272\u7EC4\u3002" })), groups?.map((group) => (_jsxs("div", { className: "flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-sm font-medium", children: [group.name, " ", group.isDefault ? "· 默认" : ""] }), _jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u6700\u5927\u5BB9\u91CF ", (group.configs?.max_capacity ?? 0) / 1024 / 1024, " MB"] })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Button, { asChild: true, size: "sm", children: _jsx(Link, { to: `/dashboard/admin/groups/${group.id}`, children: "\u7F16\u8F91" }) }), _jsx(Button, { variant: "secondary", size: "sm", disabled: removeMutation.isPending, onClick: () => removeMutation.mutate(group.id), children: "\u5220\u9664" })] })] }, group.id)))] })] })] }));
}
