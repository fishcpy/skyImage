import { ChevronDown, LogOut, MoreHorizontal } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

import { CapacityMeter } from "@/components/CapacityMeter";
import { ConfigDrawer, type SidebarCollapsibleMode, type SidebarVariantMode } from "@/components/ConfigDrawer";
import { LanguageToggle } from "@/components/LanguageToggle";
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
import { useI18n } from "@/i18n";
import { Search } from "@/components/Search";
import { buildNavSections, type NavNode, type NavSection } from "@/lib/navigation";

function SidebarNavSections({ sections }: { sections: NavSection[] }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  const isItemActive = (item: NavNode) => {
    if (!item.url) return false;
    return location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
  };

  return (
    <>
      {sections.map((section, idx) => (
        <SidebarGroup key={section.title ?? idx}>
          {section.title ? <SidebarGroupLabel>{section.title}</SidebarGroupLabel> : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item, index) => (
                <SidebarMenuItem key={item.url ?? item.title}>
                  {item.items?.length ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedMenus((prev) => ({
                            ...prev,
                            [item.title]:
                              prev[item.title] === undefined
                                ? !item.items?.some((child) => isItemActive(child))
                                : !prev[item.title]
                          }))
                        }
                        className={cn(
                          "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors",
                          "text-foreground hover:bg-accent hover:text-accent-foreground",
                          "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                          item.items.some((child) => isItemActive(child)) &&
                            "bg-accent text-accent-foreground"
                        )}
                      >
                        {item.icon ? <item.icon className="h-4 w-4" /> : null}
                        <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">{item.title}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform group-data-[collapsible=icon]:hidden",
                            (
                              expandedMenus[item.title] ??
                              item.items.some((child) => isItemActive(child))
                            )
                              ? "rotate-180"
                              : ""
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          "ml-4 overflow-hidden border-l border-border pl-3 transition-all group-data-[collapsible=icon]:hidden",
                          (
                            expandedMenus[item.title] ??
                            item.items.some((child) => isItemActive(child))
                          )
                            ? "mt-1 max-h-40"
                            : "max-h-0"
                        )}
                      >
                        <SidebarMenu className="space-y-1 py-1">
                          {item.items.map((child) => (
                            <SidebarMenuItem key={child.url}>
                              <NavLink
                                to={child.url!}
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
                                {child.title}
                              </NavLink>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </div>
                    </>
                  ) : (
                    <NavLink
                      to={item.url!}
                      end={section.title === undefined && index === 0}
                      onClick={() => {
                        if (isMobile) {
                          setOpenMobile(false);
                        }
                      }}
                      className={({ isActive }) =>
                        cn(
                          "flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                          "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground"
                        )
                      }
                    >
                      {item.icon ? <item.icon className="h-4 w-4" /> : null}
                      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
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
  const { t } = useI18n();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);
  const isAdmin = user?.isAdmin;
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
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
    return stored === "offcanvas" || stored === "icon" || stored === "none" ? stored : "icon";
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

  const sections = useMemo<NavSection[]>(
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
          <p className="min-h-7 text-lg font-semibold group-data-[collapsible=icon]:hidden">{siteConfig?.title ?? ""}</p>
          <p className="min-h-5 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">{siteConfig?.description ?? ""}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarNavSections sections={sections} />
        </SidebarContent>
        <SidebarFooter className="space-y-3 group-data-[collapsible=icon]:space-y-0">
          <div className="group-data-[collapsible=icon]:hidden">
            <CapacityMeter />
          </div>
          <div className="relative group-data-[collapsible=icon]:hidden" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-accent/40 px-4 py-3 text-left text-base hover:bg-accent"
            >
              <span className="truncate font-medium">{user?.name || t("common.guestUser")}</span>
              <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            {accountMenuOpen ? (
              <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-full min-w-[240px] rounded-md border border-border bg-popover p-1 shadow-md">
                <div className="px-3 py-2">
                  <p className="text-base font-semibold">{user?.name || t("common.unknownUser")}</p>
                  <p className="truncate pt-1 text-sm text-muted-foreground">{user?.email || t("common.noEmail")}</p>
                  <p className="pt-1 text-xs text-muted-foreground">{getUserRole()}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-base text-destructive hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" />
                  {t("user.logout")}
                </button>
              </div>
            ) : null}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="relative flex w-full min-w-0 flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=floating]:m-3 md:peer-data-[variant=floating]:rounded-xl md:peer-data-[variant=floating]:border md:peer-data-[variant=floating]:border-border md:peer-data-[variant=floating]:shadow-sm">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="md:hidden" />
          </div>
          <div className="mx-4 hidden w-full max-w-sm md:block">
            <Search placeholder={t("search.placeholder")} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
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
