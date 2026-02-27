import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteFile, fetchFiles } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";
import { useAuthStore } from "@/state/auth";
import { FileTable } from "./components/FileTable";
export function MyImagesPage() {
    const queryClient = useQueryClient();
    const [preview, setPreview] = useState(null);
    const { data: files, isLoading } = useQuery({
        queryKey: ["files"],
        queryFn: fetchFiles
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => deleteFile(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["files"] });
            // 删除成功后立即刷新用户信息（更新已使用存储）
            useAuthStore.getState().refreshUser().catch((err) => {
                console.error('[MyImagesPage] Failed to refresh user after delete:', err);
            });
        }
    });
    const deletingId = typeof deleteMutation.variables === "number"
        ? deleteMutation.variables
        : undefined;
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u6211\u7684\u56FE\u7247" }), _jsx("p", { className: "text-muted-foreground", children: "\u67E5\u770B\u3001\u7BA1\u7406\u3001\u5220\u9664\u4F60\u5DF2\u7ECF\u4E0A\u4F20\u7684\u6240\u6709\u5185\u5BB9\u3002" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u56FE\u7247\u5217\u8868" }) }), _jsx(CardContent, { children: _jsx(FileTable, { files: files, isLoading: isLoading, onDelete: (id) => deleteMutation.mutate(id), deletingId: deletingId, onPreview: (file) => setPreview(file) }) })] }), preview && (_jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4", onClick: () => setPreview(null), children: _jsxs("div", { className: "space-y-4 rounded-lg bg-background p-4 shadow-2xl", children: [_jsx("img", { src: normalizeFileUrl(preview.viewUrl || preview.directUrl), alt: preview.originalName, className: "max-h-[70vh] max-w-[80vw] rounded-md object-contain" }), _jsxs("p", { className: "text-center text-sm text-muted-foreground", children: [preview.originalName, " \u00B7 ", (preview.size / 1024).toFixed(1), " KB"] })] }) }))] }));
}
