import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GaugeCircle, Home } from "lucide-react";

import { CapacityMeter } from "@/components/CapacityMeter";
import { ConfigDrawer, type SidebarCollapsibleMode, type SidebarVariantMode } from "@/components/ConfigDrawer";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuthStore } from "@/state/auth";
import { fetchSiteConfig, logout } from "@/lib/api";
import { useI18n } from "@/i18n";
import { Search } from "@/components/Search";
import { buildNavSections } from "@/lib/navigation";
import { NavGroup } from "@/components/layout/NavGroup";
import { NavUser } from "@/components/layout/NavUser";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { t } = useI18n();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);
  const isAdmin = user?.isAdmin;
  const isDashboardHome = location.pathname === "/dashboard" || location.pathname === "/dashboard/";
  
  const [sidebarVariant, setSidebarVariant] = useState<SidebarVariantMode>(() => {
    if (typeof window === "undefined") {
      return "inset";
    }
    const stored = window.localStorage.getItem("skyimage-layout-variant");
    return stored === "inset" || stored === "floating" || stored === "sidebar" ? stored : "inset";
  });
  
  const [sidebarCollapsible, setSidebarCollapsible] = useState<SidebarCollapsibleMode>(() => {
    if (typeof window === "undefined") {
      return "icon";
    }
    const stored = window.localStorage.getItem("skyimage-layout-collapsible");
    // 强制使用 icon 模式，点击竖线时缩小到图标而不是完全收起
    return stored === "icon" || stored === "none" ? stored : "icon";
  });
  
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    const stored = window.localStorage.getItem("skyimage-sidebar-open");
    return stored == null ? true : stored === "true";
  });
  
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
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("skyimage-layout-variant", sidebarVariant);
  }, [sidebarVariant]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("skyimage-layout-collapsible", sidebarCollapsible);
  }, [sidebarCollapsible]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("skyimage-sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  const sections = useMemo(
    () => buildNavSections({ t, isAdmin: Boolean(isAdmin || user?.isSuperAdmin), siteConfig }),
    [isAdmin, siteConfig, t, user?.isSuperAdmin]
  );

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout request failure and clear local state anyway.
    }
    clear();
    window.location.href = "/login";
  };

  const getUserRole = () => {
    if (user?.isSuperAdmin) {
      return t("user.role.superAdmin");
    }
    if (user?.isAdmin) {
      return t("user.role.admin");
    }
    return t("user.role.user");
  };

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar variant={sidebarVariant} collapsible={sidebarCollapsible}>
        <SidebarHeader>
          <div className="flex flex-col gap-0.5 px-2 py-1">
            <p className="text-lg font-semibold group-data-[collapsible=icon]:hidden">{siteConfig?.title ?? ""}</p>
            <p className="text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">{siteConfig?.description ?? ""}</p>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {sections.map((section, idx) => (
            <NavGroup key={section.title ?? idx} {...section} />
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="mb-2 group-data-[collapsible=icon]:hidden">
            <CapacityMeter />
          </div>
          <NavUser
            user={{
              name: user?.name || t("common.guestUser"),
              email: user?.email || t("common.noEmail"),
              role: getUserRole(),
            }}
            onLogout={handleLogout}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="relative flex w-full min-w-0 flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=floating]:m-3 md:peer-data-[variant=floating]:rounded-xl md:peer-data-[variant=floating]:border md:peer-data-[variant=floating]:border-border md:peer-data-[variant=floating]:shadow-sm">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <div className="flex items-center gap-1">
            <SidebarTrigger className="bg-sidebar hover:bg-sidebar-accent" />
          </div>
          <div className="mx-4 hidden w-full max-w-sm md:block">
            <Search placeholder={t("search.placeholder")} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <nav className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground">
                <Link to="/">
                  <Home className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("nav.home")}</span>
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 px-2 text-muted-foreground",
                  isDashboardHome && "bg-accent font-medium text-foreground"
                )}
              >
                <Link to="/dashboard">
                  <GaugeCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("nav.dashboard")}</span>
                </Link>
              </Button>
            </nav>
            <LanguageToggle iconOnly />
            <ThemeToggle iconOnly />
            <ConfigDrawer
              variant={sidebarVariant}
              setVariant={setSidebarVariant}
              collapsible={sidebarCollapsible}
              setCollapsible={setSidebarCollapsible}
              resetLayoutSettings={() => {
                setSidebarVariant("inset");
                setSidebarCollapsible("icon");
              }}
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-8">
          <div className="animate-route-switch">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}