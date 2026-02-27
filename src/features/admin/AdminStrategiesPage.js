import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchStrategies, deleteStrategy } from "@/lib/api";
export function AdminStrategiesPage() {
    const queryClient = useQueryClient();
    const { data: strategies, isLoading } = useQuery({
        queryKey: ["admin", "strategies"],
        queryFn: fetchStrategies
    });
    const deleteMutation = useMutation({
        mutationFn: deleteStrategy,
        onSuccess: () => {
            toast.success("策略已删除");
            queryClient.invalidateQueries({ queryKey: ["admin", "strategies"] });
        },
        onError: (error) => toast.error(error.message)
    });
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u50A8\u5B58\u7B56\u7565" }), _jsx("p", { className: "text-muted-foreground", children: "\u914D\u7F6E\u4E0D\u540C\u9A71\u52A8\u3001\u6839\u8DEF\u5F84\u4E0E\u5916\u94FE\u57DF\u540D\u3002" })] }), _jsx(Button, { asChild: true, children: _jsx(Link, { to: "/dashboard/admin/strategies/new", children: "\u65B0\u589E\u7B56\u7565" }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u7B56\u7565\u5217\u8868" }) }), _jsxs(CardContent, { className: "space-y-3", children: [isLoading && _jsx("p", { className: "text-sm text-muted-foreground", children: "\u52A0\u8F7D\u4E2D..." }), !isLoading && !strategies?.length && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u672A\u914D\u7F6E\u7B56\u7565\u3002" })), strategies?.map((strategy) => (_jsxs("div", { className: "flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: strategy.name }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [strategy.configs?.driver || "local", " \u00B7", " ", strategy.configs?.url ||
                                                        strategy.configs?.base_url ||
                                                        strategy.configs?.baseUrl ||
                                                        "未配置外链"] }), strategy.groups?.length ? (_jsxs("p", { className: "text-xs text-muted-foreground", children: ["\u5DF2\u6388\u6743\u89D2\u8272\u7EC4\uFF1A", strategy.groups.map((group) => group.name).join("，")] })) : (_jsx("p", { className: "text-xs text-muted-foreground", children: "\u672A\u5173\u8054\u4EFB\u4F55\u89D2\u8272\u7EC4" }))] }), _jsxs("div", { className: "flex gap-2", children: [_jsx(Button, { asChild: true, size: "sm", children: _jsx(Link, { to: `/dashboard/admin/strategies/${strategy.id}`, children: "\u7F16\u8F91" }) }), _jsx(Button, { variant: "secondary", size: "sm", disabled: deleteMutation.isPending, onClick: () => deleteMutation.mutate(strategy.id), children: "\u5220\u9664" })] })] }, strategy.id)))] })] })] }));
}
