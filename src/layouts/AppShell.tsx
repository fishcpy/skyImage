import {
  Activity,
  Brush,
  CloudUpload,
  GaugeCircle,
  Image as ImageIcon,
  Info,
  Layers3,
  LinkIcon,
  LogOut,
  Menu,
  ServerCog,
  Settings2,
  Users,
  Users2
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CapacityMeter } from "@/components/CapacityMeter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuthStore } from "@/state/auth";
import { fetchSiteConfig } from "@/lib/api";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

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
  const disabledNotice =
    siteConfig?.accountDisabledNotice?.trim() ||
    "账户已被封禁，请联系管理员恢复访问。";

  const sections = useMemo<NavSection[]>(() => {
    const enableGallery = siteConfig?.enableGallery ?? true;
    const enableApi = siteConfig?.enableApi ?? true;
    const base: NavSection[] = [
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
          { to: "/dashboard/admin/images", label: "图片管理", icon: ImageIcon },
          { to: "/dashboard/admin/groups", label: "角色组", icon: Users },
          { to: "/dashboard/admin/users", label: "用户管理", icon: Users2 },
          { to: "/dashboard/admin/strategies", label: "储存策略", icon: Layers3 },
          { to: "/dashboard/admin/settings", label: "系统设置", icon: ServerCog }
        ]
      });
    }
    return base;
  }, [isAdmin, siteConfig]);

  const SidebarContent = () => (
    <>
      <div>
        <p className="text-lg font-semibold">
          {siteConfig?.title || "skyImage"}
        </p>
        <p className="text-sm text-muted-foreground">
          {siteConfig?.description || "轻量 云端图床"}
        </p>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto pr-2">
        {sections.map((section, idx) => (
          <div key={section.title ?? idx} className="space-y-2">
            {section.title && (
              <p className="px-3 text-xs font-semibold uppercase text-muted-foreground">
                {section.title}
              </p>
            )}
            {section.items.map((item, index) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={section.title === undefined && index === 0}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  [
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  ].join(" ")
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <CapacityMeter />
    </>
  );

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* 桌面端侧边栏 */}
      <aside className="hidden w-72 border-r bg-background p-4 lg:flex lg:flex-col lg:gap-6">
        <SidebarContent />
      </aside>

      {/* 移动端侧边栏 */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[280px] sm:w-[320px] p-4 flex flex-col gap-6">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      <div className="flex w-full flex-1 flex-col lg:w-auto">
        {isDisabled && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:px-4">
            {disabledNotice}
          </div>
        )}
        <header className="flex items-center justify-between gap-2 sm:gap-4 border-b bg-background px-3 sm:px-4 py-3">
          {/* 移动端菜单按钮 */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden -ml-2"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">打开菜单</span>
          </Button>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <ThemeToggle />
            <div className="hidden text-sm text-muted-foreground md:block">
              {user?.name} · {user?.email} · {roleLabel}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clear();
                window.location.href = "/login";
              }}
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">退出</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
