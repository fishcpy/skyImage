import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Images,
  Lock,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Link } from "react-router-dom";

import { PublicTopNav } from "@/components/PublicTopNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRegistrationStatus, type SiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { useI18n } from "@/i18n";

const homeSectionAnimation = [
  "animate-enter animate-enter-1",
  "animate-enter animate-enter-2"
];



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
  const homePageMode = siteConfig?.homePageMode ?? "default";
  const homeCustomHtml = siteConfig?.homeCustomHtml ?? "";

  if (homePageMode === "custom_html" && homeCustomHtml.trim() !== "") {
    return (
      <div className="relative min-h-screen">
        <PublicTopNav title={title} description={description} compact floating />
        <main className="min-h-screen" dangerouslySetInnerHTML={{ __html: homeCustomHtml }} />
      </div>
    );
  }

  // 使用翻译而不是数据库配置
  const badgeText = t("home.defaultBadge");
  const introText = t("home.defaultIntro");
  const displaySlogan = t("home.defaultSlogan");
  const primaryCtaText = t("home.defaultPrimaryCta");
  const dashboardCtaText = t("home.defaultDashboardCta");
  const secondaryCtaText = t("home.defaultSecondaryCta");
  const feature1Title = t("home.defaultFeature1Title");
  const feature1Desc = t("home.defaultFeature1Desc");
  const feature2Title = t("home.defaultFeature2Title");
  const feature2Desc = t("home.defaultFeature2Desc");
  const feature3Title = t("home.defaultFeature3Title");
  const feature3Desc = t("home.defaultFeature3Desc");
  const feature4Title = t("home.defaultFeature4Title");
  const feature4Desc = t("home.defaultFeature4Desc");

  const featureCards = [
    { icon: Images, title: feature1Title, desc: feature1Desc },
    { icon: Lock, title: feature2Title, desc: feature2Desc },
    { icon: Sparkles, title: feature3Title, desc: feature3Desc },
    { icon: ShieldCheck, title: feature4Title, desc: feature4Desc }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <PublicTopNav title={title} description={description} compact />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pb-20 pt-6 sm:px-8">
        <section className={homeSectionAnimation[0]}>
          <Badge variant="secondary" className="mb-4 w-fit">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {badgeText}
          </Badge>

          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            {displaySlogan}
          </h1>

          <p className="mt-4 max-w-4xl text-base text-muted-foreground sm:text-lg">{introText}</p>

          <div className="mt-5 flex flex-wrap gap-3">
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

        <section className={`${homeSectionAnimation[1]} grid gap-4 md:grid-cols-2`}>
          {featureCards.map((feature, index) => (
            <Card key={feature.title} className="transition-shadow duration-300 hover:shadow-lg">
              <CardContent className="space-y-2 p-5">
                <feature.icon className="h-5 w-5 text-primary" />
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-sm text-muted-foreground">{feature.desc}</p>
                <p className="text-xs text-muted-foreground/70">0{index + 1}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t bg-card/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-8">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-foreground">{title.trim() || "SkyImage"}</p>
            <p>{description.trim() || "Image hosting platform"}</p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} {title.trim() || "SkyImage"}</p>
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                {t("footer.privacy")}
              </Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">
                {t("footer.terms")}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
