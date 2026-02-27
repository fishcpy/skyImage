import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileTable } from "@/features/files/components/FileTable";
import { fetchAdminImages, deleteAdminImage } from "@/lib/api";
export function AdminImagesPage() {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["admin", "images"],
        queryFn: () => fetchAdminImages({ limit: 100 })
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => deleteAdminImage(id),
        onSuccess: () => {
            toast.success("已删除图片");
            queryClient.invalidateQueries({ queryKey: ["admin", "images"] });
        }
    });
    const deletingId = typeof deleteMutation.variables === "number"
        ? deleteMutation.variables
        : undefined;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u56FE\u7247\u7BA1\u7406" }), _jsx("p", { className: "text-muted-foreground", children: "\u7BA1\u7406\u6240\u6709\u7528\u6237\u7684\u4E0A\u4F20\u5185\u5BB9\uFF0C\u652F\u6301\u5BA1\u6838\u4E0E\u5220\u9664\u3002" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u5168\u90E8\u6587\u4EF6" }) }), _jsx(CardContent, { children: _jsx(FileTable, { files: data, isLoading: isLoading, onDelete: (id) => deleteMutation.mutate(id), deletingId: deletingId, showOwner: true }) })] })] }));
}
