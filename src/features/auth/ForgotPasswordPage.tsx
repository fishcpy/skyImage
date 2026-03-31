import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import { requestPasswordReset, fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n";

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config", "login"],
    queryFn: () => fetchTurnstileConfig("login"),
    enabled: !!siteConfig?.forgotPasswordTurnstileRequest
  });

  useEffect(() => {
    if (siteConfig?.forgotPasswordTurnstileRequest && turnstileConfig?.enabled && turnstileConfig.siteKey) {
      loadTurnstileScript()
        .then(() => setTurnstileReady(true))
        .catch(() => {
          toast.error(t("forgotPassword.loadTurnstileError"));
        });
    }
  }, [siteConfig?.forgotPasswordTurnstileRequest, t, turnstileConfig?.enabled, turnstileConfig?.siteKey]);

  const mutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      toast.success(t("forgotPassword.success"));
    },
    onError: (error) => toast.error(error.message)
  });

  if (siteConfig && siteConfig.forgotPasswordEnabled === false) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="fixed right-4 top-4 z-10">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>{t("forgotPassword.title")}</CardTitle>
            <CardDescription>{t("forgotPassword.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("forgotPassword.email")}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@example.com"
              />
            </div>
            <Button
              className="w-full"
              disabled={mutation.isPending || !email.trim()}
              onClick={() => {
                if (siteConfig?.forgotPasswordTurnstileRequest && !turnstileToken) {
                  toast.error(t("forgotPassword.turnstileRequired"));
                  return;
                }
                mutation.mutate({ email: email.trim(), turnstileToken });
              }}
            >
              {mutation.isPending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </Button>
            {siteConfig?.forgotPasswordTurnstileRequest && turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={turnstileConfig.siteKey}
                  onVerify={setTurnstileToken}
                  onError={() => {
                    setTurnstileToken("");
                    toast.error(t("forgotPassword.turnstileError"));
                  }}
                  onExpire={() => setTurnstileToken("")}
                />
              </div>
            )}
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="underline underline-offset-4 hover:text-primary">
                {t("forgotPassword.backToLogin")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
