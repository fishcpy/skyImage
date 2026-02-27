import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, X, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { useAuthStore } from "@/state/auth";
import { fetchUploadStrategies, uploadFile } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";
export function UploadPage() {
    const fileInputRef = useRef(null);
    const queueRef = useRef([]);
    const user = useAuthStore((state) => state.user);
    const [queue, setQueue] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [preview, setPreview] = useState(null);
    const [visibility, setVisibility] = useState(user?.defaultVisibility ?? "private");
    const { data: strategyData, isLoading: loadingStrategy } = useQuery({
        queryKey: ["files", "strategies"],
        queryFn: fetchUploadStrategies
    });
    const strategies = strategyData?.strategies ?? [];
    const [strategyId, setStrategyId] = useState(undefined);
    useEffect(() => {
        setVisibility(user?.defaultVisibility ?? "private");
    }, [user?.defaultVisibility]);
    useEffect(() => {
        if (strategies.length > 0) {
            setStrategyId(strategyData?.defaultStrategyId ?? strategies[0]?.id ?? undefined);
        }
    }, [strategies, strategyData?.defaultStrategyId]);
    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);
    useEffect(() => {
        return () => {
            queueRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
        };
    }, []);
    const handleFiles = useCallback((list) => {
        if (!list)
            return;
        const next = Array.from(list).map((file) => ({
            id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
            file,
            preview: URL.createObjectURL(file),
            status: "pending"
        }));
        setQueue((prev) => [...prev, ...next]);
    }, []);
    const removeItem = (id) => {
        setQueue((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target) {
                URL.revokeObjectURL(target.preview);
            }
            return prev.filter((item) => item.id !== id);
        });
    };
    const uploadItem = async (item) => {
        if (!strategyId) {
            toast.error("请先配置可用的储存策略");
            return;
        }
        setQueue((prev) => prev.map((it) => it.id === item.id ? { ...it, status: "uploading", error: undefined } : it));
        try {
            const record = await uploadFile({
                file: item.file,
                visibility,
                strategyId
            });
            setQueue((prev) => prev.map((it) => it.id === item.id
                ? { ...it, status: "uploaded", result: record }
                : it));
            toast.success(`${item.file.name} 上传成功`);
            // 上传成功后立即刷新用户信息（更新已使用存储）
            useAuthStore.getState().refreshUser().catch((err) => {
                console.error('[UploadPage] Failed to refresh user after upload:', err);
            });
        }
        catch (error) {
            setQueue((prev) => prev.map((it) => it.id === item.id
                ? {
                    ...it,
                    status: "error",
                    error: error?.message || "上传失败"
                }
                : it));
        }
    };
    const uploadAll = () => {
        queueRef.current
            .filter((item) => item.status === "pending")
            .forEach((item) => uploadItem(item));
    };
    const queueEmpty = queue.length === 0;
    const uploading = queue.some((item) => item.status === "uploading");
    const statusText = useCallback((item) => {
        switch (item.status) {
            case "pending":
                return "等待上传";
            case "uploading":
                return "上传中...";
            case "uploaded":
                return "已上传";
            case "error":
                return item.error || "上传失败";
            default:
                return "";
        }
    }, []);
    const copy = (text) => {
        navigator.clipboard.writeText(normalizeFileUrl(text));
        toast.success("已复制链接");
    };
    const formatSize = (size) => {
        if (size > 1024 * 1024) {
            return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        }
        return `${(size / 1024).toFixed(2)} KB`;
    };
    const strategyDisabled = loadingStrategy || strategies.length === 0;
    const dropHandlers = {
        onDragOver: (event) => {
            event.preventDefault();
            setIsDragging(true);
        },
        onDragLeave: () => setIsDragging(false),
        onDrop: (event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(event.dataTransfer.files);
        }
    };
    const clearQueue = useCallback(() => {
        setQueue((prev) => {
            prev.forEach((item) => URL.revokeObjectURL(item.preview));
            return [];
        });
        queueRef.current = [];
        setPreview(null);
    }, []);
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold", children: "\u6587\u4EF6\u4E0A\u4F20" }), _jsx("p", { className: "text-muted-foreground", children: "\u6309\u9700\u9009\u62E9\u50A8\u5B58\u7B56\u7565\u3001\u53EF\u89C1\u6027\u5E76\u6279\u91CF\u4E0A\u4F20\u56FE\u7247\u3002" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u4E0A\u4F20\u6587\u4EF6" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: `flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${isDragging ? "border-primary/80 bg-primary/10" : "border-border/60"}`, onClick: () => fileInputRef.current?.click(), ...dropHandlers, children: [_jsx(UploadCloud, { className: "h-10 w-10 text-muted-foreground" }), _jsx("p", { className: "mt-3 text-sm text-muted-foreground", children: "\u62D6\u62FD\u6587\u4EF6\u5230\u8FD9\u91CC\uFF0C\u652F\u6301\u6279\u91CF\u4E0A\u4F20" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u70B9\u51FB\u4E0A\u65B9\u56FE\u6807\u4E5F\u53EF\u4EE5\u9009\u62E9\u6587\u4EF6" }), _jsx(Input, { ref: fileInputRef, type: "file", multiple: true, className: "hidden", onChange: (event) => handleFiles(event.target.files) })] }), _jsxs("div", { className: "flex flex-col gap-3 border-t pt-4", children: [queueEmpty && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u6587\u4EF6\uFF0C\u9009\u62E9\u6216\u62D6\u62FD\u56FE\u7247\u5F00\u59CB\u4E0A\u4F20\u3002" })), queue.map((item) => (_jsxs("div", { className: "flex flex-col gap-3 rounded-xl border border-border/50 bg-card/50 p-3 md:flex-row md:items-center md:justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { type: "button", className: "h-12 w-12 overflow-hidden rounded-md border bg-muted", onClick: () => setPreview(item.preview), children: _jsx("img", { src: item.preview, alt: item.file.name, className: "h-full w-full object-cover" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: item.file.name }), _jsxs("p", { className: "text-xs text-muted-foreground", children: [formatSize(item.file.size), " \u00B7 ", statusText(item)] }), item.result && (_jsxs("div", { className: "mt-1 flex flex-wrap gap-2 text-xs", children: [_jsx(Button, { variant: "link", size: "sm", className: "px-0", onClick: () => copy(item.result.directUrl), children: "\u590D\u5236\u94FE\u63A5" }), _jsx(Button, { variant: "link", size: "sm", className: "px-0", onClick: () => copy(item.result.markdown), children: "Markdown" })] }))] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Button, { variant: "ghost", size: "icon", onClick: () => setPreview(item.preview), title: "\u9884\u89C8", children: _jsx(Eye, { className: "h-4 w-4" }) }), item.status === "pending" && (_jsx(Button, { size: "sm", onClick: () => uploadItem(item), disabled: strategyDisabled, children: "\u4E0A\u4F20" })), item.status === "uploading" && (_jsx(Button, { size: "sm", variant: "outline", disabled: true, children: "\u4E0A\u4F20\u4E2D..." })), item.status !== "uploaded" && (_jsxs(Button, { variant: "secondary", size: "sm", onClick: () => removeItem(item.id), children: [_jsx(X, { className: "mr-1 h-4 w-4" }), "\u4E0D\u4E0A\u4F20"] }))] })] }, item.id)))] }), _jsxs("div", { className: "flex flex-col gap-4 rounded-xl border border-border/40 bg-muted/40 p-4", children: [_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-sm font-medium", children: "\u9ED8\u8BA4\u53EF\u89C1\u6027" }), _jsxs(Select, { value: visibility, onValueChange: (value) => setVisibility(value), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u53EF\u89C1\u6027" }) }), _jsxs(SelectContent, { children: [_jsx(SelectItem, { value: "private", children: "\u79C1\u6709" }), _jsx(SelectItem, { value: "public", children: "\u516C\u5F00" })] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "text-sm font-medium", children: "\u50A8\u5B58\u7B56\u7565" }), _jsxs(Select, { value: strategyId?.toString() ?? "", onValueChange: (value) => setStrategyId(value ? Number(value) : undefined), disabled: strategyDisabled, children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u50A8\u5B58\u7B56\u7565" }) }), _jsx(SelectContent, { children: strategies.map((strategy) => (_jsx(SelectItem, { value: strategy.id.toString(), children: strategy.name }, strategy.id))) })] }), strategyDisabled && (_jsx("p", { className: "text-xs text-destructive", children: "\u8BF7\u5148\u5728\u540E\u53F0\u914D\u7F6E\u50A8\u5B58\u7B56\u7565\u5E76\u5173\u8054\u89D2\u8272\u7EC4\u3002" }))] })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs(Button, { onClick: uploadAll, disabled: queue.filter((item) => item.status === "pending").length === 0 ||
                                                    uploading ||
                                                    strategyDisabled, children: [_jsx(UploadCloud, { className: "mr-2 h-4 w-4" }), "\u4E0A\u4F20\u5168\u90E8\u5F85\u4E0A\u4F20\u6587\u4EF6"] }), _jsx(Button, { variant: "ghost", onClick: clearQueue, disabled: queueEmpty, children: "\u6E05\u7A7A\u5217\u8868" })] })] })] })] }), preview && (_jsx("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4", onClick: () => setPreview(null), children: _jsx("img", { src: preview, alt: "\u9884\u89C8", className: "max-h-full max-w-full rounded-lg object-contain shadow-2xl" }) }))] }));
}
