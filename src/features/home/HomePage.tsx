import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Images, Lock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRegistrationStatus, type SiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";

export function HomePage({ siteConfig }: { siteConfig?: SiteConfig }) {
  const token = useAuthStore((state) => state.token);
  const { data: registrationStatus } = useQuery({
    queryKey: ["registration-status"],
    queryFn: fetchRegistrationStatus,
    enabled: !token,
    staleTime: 2 * 60 * 1000
  });

  const title = siteConfig?.title || "skyImage";
  const description = siteConfig?.description || "云端图床";
  const slogan = siteConfig?.slogan?.trim() || "简单、稳定、可扩展的图像托管平台";
  const badgeText = siteConfig?.homeBadgeText?.trim() || "新首页";
  const introText =
    siteConfig?.homeIntroText?.trim() ||
    "面向团队和个人的现代化图像托管面板，支持多策略存储、权限控制和 API 接入。";
  const primaryCtaText = siteConfig?.homePrimaryCtaText?.trim() || "登录系统";
  const dashboardCtaText = siteConfig?.homeDashboardCtaText?.trim() || "进入控制台";
  const secondaryCtaText = siteConfig?.homeSecondaryCtaText?.trim() || "注册账号";
  const feature1Title = siteConfig?.homeFeature1Title?.trim() || "图像管理";
  const feature1Desc = siteConfig?.homeFeature1Desc?.trim() || "上传、检索、批量操作和链接复制一体化。";
  const feature2Title = siteConfig?.homeFeature2Title?.trim() || "权限与安全";
  const feature2Desc = siteConfig?.homeFeature2Desc?.trim() || "支持角色组、注册策略和登录验证配置。";
  const feature3Title = siteConfig?.homeFeature3Title?.trim() || "可配置品牌信息";
  const feature3Desc =
    siteConfig?.homeFeature3Desc?.trim() || "站点标题、描述和首页标语均可在系统设置中管理。";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.12),transparent_38%),radial-gradient(circle_at_90%_70%,hsl(var(--muted-foreground)/0.1),transparent_45%)]" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <div>
          <p className="text-xl font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-16 pt-6 sm:px-8">
        <Badge variant="secondary" className="w-fit">
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          {badgeText}
        </Badge>
        <section className="max-w-3xl space-y-5">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            {slogan}
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

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="space-y-2 p-5">
              <Images className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium">{feature1Title}</p>
              <p className="text-sm text-muted-foreground">{feature1Desc}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-5">
              <Lock className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium">{feature2Title}</p>
              <p className="text-sm text-muted-foreground">{feature2Desc}</p>
            </CardContent>
          </Card>
          <Card>
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
