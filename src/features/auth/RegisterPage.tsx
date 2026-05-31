import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

import { fetchRegistrationStatus, fetchSiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "@/components/register-form";
import { PublicTopNav } from "@/components/PublicTopNav";
import { useI18n } from "@/i18n";

export function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);

  const {
    data: registrationStatus,
    isLoading: checkingStatus,
    error: statusError
  } = useQuery({
    queryKey: ["registration-status"],
    queryFn: fetchRegistrationStatus
  });

  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
  });

  const siteName = siteConfig?.title;
  const emailVerifyEnabled = registrationStatus?.emailVerifyEnabled ?? false;

  if (token) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  if (checkingStatus) {
    return (
      <div className="min-h-svh bg-muted">
        <PublicTopNav title={siteName} description={siteConfig?.description || ""} compact />
        <div className="flex min-h-[calc(100svh-88px)] flex-col items-center justify-center gap-6 px-6 pb-10 md:px-10">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">{t("common.loading")}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (statusError || !registrationStatus?.allowed) {
    return (
      <div className="min-h-svh bg-muted">
        <PublicTopNav title={siteName} description={siteConfig?.description || ""} compact />
        <div className="flex min-h-[calc(100svh-88px)] flex-col items-center justify-center gap-6 px-6 pb-10 md:px-10">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <div className="self-center font-medium text-xl">
              {siteName ? siteName : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>{t("register.closed")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("register.closedDescription")}
                </p>
                <Button asChild className="w-full">
                  <Link to="/login">{t("register.backToLogin")}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-muted">
      <PublicTopNav title={siteName} description={siteConfig?.description || ""} compact />
      <div className="flex min-h-[calc(100svh-88px)] flex-col items-center justify-center gap-6 px-6 pb-10 md:px-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <a href="/" className="self-center font-medium text-xl">
            {siteName}
          </a>
          <RegisterForm emailVerifyEnabled={emailVerifyEnabled} />
        </div>
      </div>
    </div>
  );
}
