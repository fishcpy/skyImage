import { GaugeCircle, Home, Loader2 } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PaletteToggle } from "@/components/PaletteToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "@/state/auth";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

type PublicTopNavProps = {
  title?: string;
  description?: string;
  compact?: boolean;
  floating?: boolean;
};

export function PublicTopNav({ title, description, compact = false, floating = false }: PublicTopNavProps) {
  const { t } = useI18n();
  const token = useAuthStore((state) => state.token);
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isDashboard = location.pathname.startsWith("/dashboard");

  return (
    <header
      className={
        floating
          ? "fixed left-0 top-0 z-50 w-full border-b border-border/40 bg-background/55 backdrop-blur-md"
          : "sticky top-0 z-20 w-full border-b border-border/40 bg-background/70 backdrop-blur-md"
      }
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <img src="/favicon.ico" alt="site icon" className="h-5 w-5 rounded-sm" />
          <div>
            {title ? (
              <p className={compact ? "text-lg font-semibold" : "text-xl font-semibold"}>{title}</p>
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">{description || ""}</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 gap-1.5 px-2 text-muted-foreground",
                isHome && "bg-accent font-medium text-foreground"
              )}
            >
              <Link to="/">
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.home")}</span>
              </Link>
            </Button>
            {token && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 px-2 text-muted-foreground",
                  isDashboard && "bg-accent font-medium text-foreground"
                )}
              >
                <Link to="/dashboard">
                  <GaugeCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("nav.dashboard")}</span>
                </Link>
              </Button>
            )}
          </nav>
          <LanguageToggle iconOnly />
          <PaletteToggle iconOnly />
          <ThemeToggle iconOnly />
        </div>
      </div>
    </header>
  );
}
