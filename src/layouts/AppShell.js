import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Activity, Brush, CloudUpload, GaugeCircle, Image as ImageIcon, Info, Layers3, LinkIcon, LogOut, Menu, ServerCog, Settings2, Users, Users2 } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CapacityMeter } from "@/components/CapacityMeter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuthStore } from "@/state/auth";
import { fetchSiteConfig } from "@/lib/api";
export function AppShell() {
    const [open, setOpen] = useState(false);
    const user = useAuthStore((state) => state.user);
    const clear = useAuthStore((state) => state.clear);
    const isAdmin = user?.isAdmin;
    const isDisabled = user?.status === 0;
    const roleLabel = user?.isSuperAdmin
        ? "超级管理员"
        : isAdmin
            ? "管理员"
            : "普通用户";
    const { data: siteConfig } = useQuery({
        queryKey: ["site-config"],
        queryFn: fetchSiteConfig
    });
    const disabledNotice = siteConfig?.accountDisabledNotice?.trim() ||
        "账户已被封禁，请联系管理员恢复访问。";
    const sections = useMemo(() => {
        const enableGallery = siteConfig?.enableGallery ?? true;
        const enableApi = siteConfig?.enableApi ?? true;
        const base = [
            {
                items: [{ to: "/dashboard", label: "仪表盘", icon: GaugeCircle }]
            },
            {
                title: "我的",
                items: [
                    { to: "/dashboard/upload", label: "上传图片", icon: CloudUpload },
                    { to: "/dashboard/images", label: "我的图片", icon: ImageIcon },
                    { to: "/dashboard/settings", label: "设置", icon: Settings2 }
                ]
            },
            {
                title: "公共",
                items: [
                    ...(enableGallery
                        ? [{ to: "/dashboard/gallery", label: "画廊", icon: Brush }]
                        : []),
                    ...(enableApi ? [{ to: "/dashboard/api", label: "接口", icon: LinkIcon }] : []),
                    { to: "/dashboard/about", label: "关于", icon: Info }
                ]
            }
        ];
        if (isAdmin) {
            base.push({
                title: "系统",
                items: [
                    { to: "/dashboard/admin/console", label: "控制台", icon: Activity },
                    { to: "/dashboard/admin/groups", label: "角色组", icon: Users },
                    { to: "/dashboard/admin/users", label: "用户管理", icon: Users2 },
                    { to: "/dashboard/admin/images", label: "图片管理", icon: ImageIcon },
                    { to: "/dashboard/admin/strategies", label: "储存策略", icon: Layers3 },
                    { to: "/dashboard/admin/settings", label: "系统设置", icon: ServerCog }
                ]
            });
        }
        return base;
    }, [isAdmin, siteConfig]);
    const SidebarContent = () => (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("p", { className: "text-lg font-semibold", children: siteConfig?.title || "skyImage" }), _jsx("p", { className: "text-sm text-muted-foreground", children: siteConfig?.description || "轻量 云端图床" })] }), _jsx("nav", { className: "flex-1 space-y-6 overflow-y-auto pr-2", children: sections.map((section, idx) => (_jsxs("div", { className: "space-y-2", children: [section.title && (_jsx("p", { className: "px-3 text-xs font-semibold uppercase text-muted-foreground", children: section.title })), section.items.map((item, index) => (_jsxs(NavLink, { to: item.to, end: section.title === undefined && index === 0, onClick: () => setOpen(false), className: ({ isActive }) => [
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isActive
                                    ? "bg-primary/10 font-medium text-primary"
                                    : "text-muted-foreground hover:text-foreground"
                            ].join(" "), children: [_jsx(item.icon, { className: "h-4 w-4" }), item.label] }, item.to)))] }, section.title ?? idx))) }), _jsx(CapacityMeter, {})] }));
    return (_jsxs("div", { className: "flex min-h-screen bg-muted/30", children: [_jsx("aside", { className: "hidden w-72 border-r bg-background p-4 lg:flex lg:flex-col lg:gap-6", children: _jsx(SidebarContent, {}) }), _jsx(Sheet, { open: open, onOpenChange: setOpen, children: _jsx(SheetContent, { side: "left", className: "w-[280px] sm:w-[320px] p-4 flex flex-col gap-6", children: _jsx(SidebarContent, {}) }) }), _jsxs("div", { className: "flex w-full flex-1 flex-col lg:w-auto", children: [isDisabled && (_jsx("div", { className: "border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:px-4", children: disabledNotice })), _jsxs("header", { className: "flex items-center justify-between gap-2 sm:gap-4 border-b bg-background px-3 sm:px-4 py-3", children: [_jsxs(Button, { variant: "ghost", size: "sm", className: "lg:hidden -ml-2", onClick: () => setOpen(true), children: [_jsx(Menu, { className: "h-5 w-5" }), _jsx("span", { className: "sr-only", children: "\u6253\u5F00\u83DC\u5355" })] }), _jsxs("div", { className: "flex items-center gap-2 sm:gap-4 ml-auto", children: [_jsx(ThemeToggle, {}), _jsxs("div", { className: "hidden text-sm text-muted-foreground md:block", children: [user?.name, " \u00B7 ", user?.email, " \u00B7 ", roleLabel] }), _jsxs(Button, { variant: "ghost", size: "sm", onClick: () => {
                                            clear();
                                            window.location.href = "/login";
                                        }, children: [_jsx(LogOut, { className: "h-4 w-4 sm:mr-2" }), _jsx("span", { className: "hidden sm:inline", children: "\u9000\u51FA" })] })] })] }), _jsx("main", { className: "flex-1 p-3 sm:p-4 lg:p-8", children: _jsx(Outlet, {}) })] })] }));
}
