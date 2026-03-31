import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { fetchHasUsers, fetchSiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/login-form";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n";

export function LoginPage() {
  const { t } = useI18n();
  const token = useAuthStore((state) => state.token);

  const {
    data: hasUsers,
    isLoading: checkingUsers,
    error,
    refetch
  } = useQuery({
    queryKey: ["auth", "has-users"],
    queryFn: fetchHasUsers
  });

  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
  });

  const siteName = siteConfig?.title || "SkyImage";

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!checkingUsers && hasUsers === false) {
    return <Navigate to="/installer" replace />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center">
        <p className="text-lg font-semibold">{t("login.page.connectionErrorTitle")}</p>
        <p className="text-sm text-muted-foreground">
          {t("login.page.connectionErrorDescription")}
        </p>
        <Button onClick={() => refetch()}>{t("login.page.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="fixed right-4 top-4 z-10">
        <LanguageToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="self-center font-medium text-xl">
          {siteName}
        </a>
        {checkingUsers ? (
          <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            {t("login.page.checking")}
          </div>
        ) : (
          <LoginForm forgotPasswordEnabled={siteConfig?.forgotPasswordEnabled === true} />
        )}
      </div>
    </div>
  );
}
