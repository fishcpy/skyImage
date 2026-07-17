import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchHasUsers, fetchProfile, fetchSiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/login-form";
import { PublicTopNav } from "@/components/PublicTopNav";
import { useI18n } from "@/i18n";

export function LoginPage() {
  const { t } = useI18n();
  const token = useAuthStore((state) => state.token);
  const setAuth = useAuthStore((state) => state.setAuth);
  const [sessionChecked, setSessionChecked] = useState(Boolean(token));

  useEffect(() => {
    if (token) {
      setSessionChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchProfile();
        if (!cancelled && user) {
          setAuth({ user });
        }
      } catch {
        // no session
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, setAuth]);

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

  const siteName = siteConfig?.title;

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
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
    <div className="min-h-svh bg-muted">
      <PublicTopNav title={siteName} description={siteConfig?.description || ""} compact />
      <div className="flex min-h-[calc(100svh-88px)] flex-col items-center justify-center gap-6 px-6 pb-10 md:px-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="self-center font-medium text-xl">
            {siteName ? siteName : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
          {checkingUsers ? (
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              {t("login.page.checking")}
            </div>
          ) : (
            <LoginForm forgotPasswordEnabled={siteConfig?.forgotPasswordEnabled === true} />
          )}
        </div>
      </div>
    </div>
  );
}
