import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Images, Lock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRegistrationStatus, type SiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { useI18n } from "@/i18n";

export function HomePage({ siteConfig }: { siteConfig?: SiteConfig }) {
  const { t } = useI18n();
  const token = useAuthStore((state) => state.token);
  const { data: registrationStatus } = useQuery({
    queryKey: ["registration-status"],
    queryFn: fetchRegistrationStatus,
    enabled: !token,
    staleTime: 2 * 60 * 1000
  });

  const title = siteConfig?.title ?? "";
  const description = siteConfig?.description ?? "";
  const slogan = siteConfig?.slogan?.trim() ?? "";
  const badgeText = siteConfig?.homeBadgeText?.trim() || t("home.defaultBadge");
  const introText = siteConfig?.homeIntroText?.trim() || t("home.defaultIntro");
  const primaryCtaText = siteConfig?.homePrimaryCtaText?.trim() || t("home.defaultPrimaryCta");
  const dashboardCtaText = siteConfig?.homeDashboardCtaText?.trim() || t("home.defaultDashboardCta");
  const secondaryCtaText = siteConfig?.homeSecondaryCtaText?.trim() || t("home.defaultSecondaryCta");
  const feature1Title = siteConfig?.homeFeature1Title?.trim() || t("home.defaultFeature1Title");
  const feature1Desc = siteConfig?.homeFeature1Desc?.trim() || t("home.defaultFeature1Desc");
  const feature2Title = siteConfig?.homeFeature2Title?.trim() || t("home.defaultFeature2Title");
  const feature2Desc = siteConfig?.homeFeature2Desc?.trim() || t("home.defaultFeature2Desc");
  const feature3Title = siteConfig?.homeFeature3Title?.trim() || t("home.defaultFeature3Title");
  const feature3Desc = siteConfig?.homeFeature3Desc?.trim() || t("home.defaultFeature3Desc");
  const displaySlogan = slogan || t("home.defaultSlogan");

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 animate-float-slow bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.12),transparent_38%),radial-gradient(circle_at_90%_70%,hsl(var(--muted-foreground)/0.1),transparent_45%)]" />
      <header className="mx-auto flex w-full max-w-6xl animate-enter items-center justify-between px-4 py-6 sm:px-8">
        <div>
          <p className="text-xl font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-6 sm:px-8">
        <Badge variant="secondary" className="animate-enter animate-enter-1 w-fit">
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {badgeText}
        </Badge>
        <section className="max-w-3xl animate-enter animate-enter-2 space-y-5">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            {displaySlogan}
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            {introText}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link to={token ? "/dashboard" : "/login"}>
                {token ? dashboardCtaText : primaryCtaText}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {!token && registrationStatus?.allowed && (
              <Button asChild size="lg" variant="outline">
                <Link to="/register">{secondaryCtaText}</Link>
              </Button>
            )}
          </div>
        </section>

        <section className="grid gap-4 animate-enter animate-enter-3 md:grid-cols-3">
          <Card className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="space-y-2 p-5">
              <Images className="h-5 w-5 text-primary animate-gentle-pulse" />
              <p className="text-sm font-medium">{feature1Title}</p>
              <p className="text-sm text-muted-foreground">{feature1Desc}</p>
            </CardContent>
          </Card>
          <Card className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="space-y-2 p-5">
              <Lock className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium">{feature2Title}</p>
              <p className="text-sm text-muted-foreground">{feature2Desc}</p>
            </CardContent>
          </Card>
          <Card className="transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
            <CardContent className="space-y-2 p-5">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium">{feature3Title}</p>
              <p className="text-sm text-muted-foreground">{feature3Desc}</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
