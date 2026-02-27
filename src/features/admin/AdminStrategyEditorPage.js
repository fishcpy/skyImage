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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchGroups, fetchStrategies, saveStrategy } from "@/lib/api";
const driverOptions = [
    { key: "local", label: "本地储存" }
];
export function AdminStrategyEditorPage() {
    const { id } = useParams();
    const isEditing = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: strategies } = useQuery({
        queryKey: ["admin", "strategies"],
        queryFn: fetchStrategies
    });
    const { data: groups } = useQuery({
        queryKey: ["admin", "groups"],
        queryFn: fetchGroups
    });
    const [form, setForm] = useState({
        key: 1,
        name: "",
        intro: "",
        configs: {
            driver: "local",
            root: "storage/uploads",
            url: ""
        }
    });
    const [selectedGroups, setSelectedGroups] = useState([]);
    useEffect(() => {
        if (isEditing && strategies) {
            const target = strategies.find((item) => item.id === Number(id));
            if (target) {
                setForm({
                    ...target,
                    configs: {
                        driver: target.configs?.driver || "local",
                        root: target.configs?.root || "storage/uploads",
                        url: target.configs?.url ||
                            target.configs?.base_url ||
                            target.configs?.baseUrl ||
                            ""
                    }
                });
                setSelectedGroups(target.groups?.map((group) => group.id) || []);
            }
        }
        else if (!isEditing) {
            setForm({
                key: 1,
                name: "",
                intro: "",
                configs: { driver: "local", root: "storage/uploads", url: "" }
            });
            setSelectedGroups([]);
        }
    }, [id, isEditing, strategies]);
    const saveMutation = useMutation({
        mutationFn: saveStrategy,
        onSuccess: () => {
            toast.success("策略已保存");
            queryClient.invalidateQueries({ queryKey: ["admin", "strategies"] });
            navigate("/dashboard/admin/strategies");
        },
        onError: (error) => toast.error(error.message)
    });
    const handleSave = () => {
        if (!form.name)
            return;
        saveMutation.mutate({
            ...form,
            groupIds: selectedGroups,
            configs: {
                ...form.configs,
                url: form.configs?.url ||
                    form.configs?.base_url ||
                    form.configs?.baseUrl ||
                    "",
                base_url: form.configs?.url ||
                    form.configs?.base_url ||
                    form.configs?.baseUrl ||
                    ""
            }
        });
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("p", { className: "text-sm text-muted-foreground", children: [_jsx(Link, { className: "text-primary", to: "/dashboard/admin/strategies", children: "\u50A8\u5B58\u7B56\u7565" }), " ", "/ ", isEditing ? "编辑策略" : "新增策略"] }), _jsx("h1", { className: "text-2xl font-semibold", children: isEditing ? form.name : "新建策略" })] }), _jsxs(Card, { children: [_jsx(CardHeader, { children: _jsx(CardTitle, { children: "\u7B56\u7565\u914D\u7F6E" }) }), _jsxs(CardContent, { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u7B56\u7565\u540D\u79F0" }), _jsx(Input, { value: form.name || "", onChange: (e) => setForm((prev) => ({ ...prev, name: e.target.value })) })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u9A71\u52A8\u7C7B\u578B" }), _jsxs(Select, { value: form.configs?.driver || "local", onValueChange: (value) => setForm((prev) => ({ ...prev, configs: { ...prev.configs, driver: value } })), children: [_jsx(SelectTrigger, { children: _jsx(SelectValue, { placeholder: "\u9009\u62E9\u9A71\u52A8" }) }), _jsx(SelectContent, { children: driverOptions.map((option) => (_jsx(SelectItem, { value: option.key, children: option.label }, option.key))) })] })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u7B80\u4ECB\uFF08\u53EF\u9009\uFF09" }), _jsx(Input, { value: form.intro || "", onChange: (e) => setForm((prev) => ({ ...prev, intro: e.target.value })) })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u50A8\u5B58\u6839\u8DEF\u5F84" }), _jsx(Input, { value: form.configs?.root || "", onChange: (e) => setForm((prev) => ({ ...prev, configs: { ...prev.configs, root: e.target.value } })) }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u786E\u4FDD\u8BE5\u8DEF\u5F84\u5177\u6709\u8BFB\u5199\u6743\u9650\u3002" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u5916\u90E8\u8BBF\u95EE\u57DF\u540D" }), _jsx(Input, { value: form.configs?.url || "", onChange: (e) => setForm((prev) => ({
                                                    ...prev,
                                                    configs: { ...prev.configs, url: e.target.value }
                                                })), placeholder: "https://cdn.example.com/uploads" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "\u7528\u4E8E\u751F\u6210\u56FE\u50CF\u9884\u89C8\u94FE\u63A5\uFF0C\u53EF\u4E3A\u7A7A\u3002" })] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx(Label, { children: "\u6388\u6743\u89D2\u8272\u7EC4" }), _jsxs("div", { className: "space-y-3", children: [groups?.map((group) => (_jsxs("div", { className: "flex items-center justify-between rounded-md border p-3", children: [_jsx("div", { children: _jsxs("p", { className: "text-sm font-medium", children: [group.name, group.isDefault && (_jsx("span", { className: "ml-2 text-xs text-muted-foreground", children: "\u00B7 \u9ED8\u8BA4" }))] }) }), _jsx(Checkbox, { id: `group-${group.id}`, checked: selectedGroups.includes(group.id), onCheckedChange: (checked) => {
                                                            const actualValue = checked === 'indeterminate' ? false : checked;
                                                            if (actualValue) {
                                                                setSelectedGroups((prev) => [...prev, group.id]);
                                                            }
                                                            else {
                                                                setSelectedGroups((prev) => prev.filter((id) => id !== group.id));
                                                            }
                                                        } })] }, group.id))), !groups?.length && (_jsx("p", { className: "text-sm text-muted-foreground", children: "\u6682\u65E0\u89D2\u8272\u7EC4\uFF0C\u8BF7\u5148\u521B\u5EFA\u3002" }))] })] }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { onClick: handleSave, disabled: !form.name || saveMutation.isPending, children: saveMutation.isPending ? "保存中..." : "保存策略" }), _jsx(Button, { variant: "ghost", onClick: () => navigate("/dashboard/admin/strategies"), disabled: saveMutation.isPending, children: "\u53D6\u6D88" })] })] })] })] }));
}
