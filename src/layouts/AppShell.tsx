import {
  Activity,
  Brush,
  ChevronDown,
  CloudUpload,
  GaugeCircle,
  Image as ImageIcon,
  Info,
  Layers3,
  LinkIcon,
  LogOut,
  MoreHorizontal,
  ServerCog,
  Settings2,
  Users,
  Users2
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

import { CapacityMeter } from "@/components/CapacityMeter";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import { useAuthStore } from "@/state/auth";
import { fetchSiteConfig, logout } from "@/lib/api";

type NavItem = {
  to?: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

function SidebarNavSections({ sections }: { sections: NavSection[] }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  const isItemActive = (item: NavItem) => {
    if (!item.to) return false;
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  return (
    <>
      {sections.map((section, idx) => (
        <SidebarGroup key={section.title ?? idx}>
          {section.title ? <SidebarGroupLabel>{section.title}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item, index) => (
                <SidebarMenuItem key={item.to ?? item.label}>
                  {item.children?.length ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMenus((prev) => ({
                            ...prev,
                            [item.label]:
                              prev[item.label] === undefined
                                ? !item.children?.some((child) => isItemActive(child))
                                : !prev[item.label]
                          }))
                        }
                        className={cn(
                          "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors",
                          "text-foreground hover:bg-accent hover:text-accent-foreground",
                          item.children.some((child) => isItemActive(child)) &&
                            "bg-accent text-accent-foreground"
                        )}
                      >
                        {item.icon ? <item.icon className="h-4 w-4" /> : null}
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            (
                              expandedMenus[item.label] ??
                              item.children.some((child) => isItemActive(child))
                            )
                              ? "rotate-180"
                              : ""
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          "ml-4 overflow-hidden border-l border-border pl-3 transition-all",
                          (
                            expandedMenus[item.label] ??
                            item.children.some((child) => isItemActive(child))
                          )
                            ? "mt-1 max-h-40"
                            : "max-h-0"
                        )}
                      >
                        <SidebarMenu className="space-y-1 py-1">
                          {item.children.map((child) => (
                            <SidebarMenuItem key={child.to}>
                              <NavLink
                                to={child.to!}
                                onClick={() => {
                                  if (isMobile) {
                                    setOpenMobile(false);
                                  }
                                }}
                                className={({ isActive }) =>
                                  cn(
                                    "flex h-8 items-center rounded-md px-2 text-sm transition-colors",
                                    isActive
                                      ? "bg-accent text-accent-foreground"
                                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                  )
                                }
                              >
                                {child.label}
                              </NavLink>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </div>
                    </>
                  ) : (
                    <NavLink
                      to={item.to!}
                      end={section.title === undefined && index === 0}
                      onClick={() => {
                        if (isMobile) {
                          setOpenMobile(false);
                        }
                      }}
                      className={({ isActive }) =>
                        cn(
                          "flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                        )
                      }
                    >
                      {item.icon ? <item.icon className="h-4 w-4" /> : null}
                      <span>{item.label}</span>
                    </NavLink>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

export function AppShell() {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);
  const isAdmin = user?.isAdmin;
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  
  const getCachedConfig = () => {
    try {
      const cached = localStorage.getItem("skyimage-site-config");
      return cached ? JSON.parse(cached) : undefined;
    } catch {
      return undefined;
    }
  };
  
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    initialData: getCachedConfig,
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (!accountMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

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
          {
            label: "系统设置",
            icon: ServerCog,
            children: [
              { to: "/dashboard/admin/settings/site", label: "站点信息" },
              { to: "/dashboard/admin/settings/system", label: "系统设置" }
            ]
          }
        ]
      });
    }
    return base;
  }, [isAdmin, siteConfig]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout request failure and clear local state anyway.
    }
    clear();
    window.location.href = "/login";
  };

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <p className="min-h-7 text-lg font-semibold">{siteConfig?.title ?? ""}</p>
          <p className="min-h-5 text-sm text-muted-foreground">{siteConfig?.description ?? ""}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNavSections sections={sections} />
        </SidebarContent>
        <SidebarFooter className="space-y-3">
          <CapacityMeter />
          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-accent/40 px-4 py-3 text-left text-base hover:bg-accent"
            >
              <span className="truncate font-medium">{user?.name || "未登录用户"}</span>
              <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            {accountMenuOpen ? (
              <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-full min-w-[240px] rounded-md border border-border bg-popover p-1 shadow-md">
                <div className="px-3 py-2">
                  <p className="text-base font-semibold">{user?.name || "未知用户"}</p>
                  <p className="truncate pt-1 text-sm text-muted-foreground">{user?.email || "暂无邮箱"}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-base text-destructive hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b bg-background px-3 sm:px-4">
          <SidebarTrigger className="lg:hidden" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
