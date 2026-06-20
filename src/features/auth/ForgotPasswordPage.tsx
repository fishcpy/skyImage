import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import { requestPasswordReset, fetchSiteConfig, fetchCaptchaConfig } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UnifiedCaptcha, type UnifiedCaptchaRef } from "@/components/UnifiedCaptcha";
import { LanguageToggle } from "@/components/LanguageToggle";
import { PaletteToggle } from "@/components/PaletteToggle";
import { useI18n } from "@/i18n";

export function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaData, setCaptchaData] = useState<Record<string, string> | undefined>();
  const captchaRef = useRef<UnifiedCaptchaRef>(null);
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });

  const { data: captchaConfig } = useQuery({
    queryKey: ["captcha-config", "forgot_password_request"],
    queryFn: () => fetchCaptchaConfig("forgot_password_request"),
    enabled: !!siteConfig?.forgotPasswordTurnstileRequest
  });

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
      <div className="fixed right-4 top-4 z-10 flex items-center gap-2">
        <LanguageToggle />
        <PaletteToggle />
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
            {captchaConfig?.enabled && captchaConfig.siteKey && captchaConfig.provider && (
              <div className="flex justify-center">
                <UnifiedCaptcha
                  ref={captchaRef}
                  provider={captchaConfig.provider as "cloudflare" | "geetest"}
                  siteKey={captchaConfig.siteKey}
                  onVerify={(token, extraData) => {
                    setCaptchaToken(token);
                    setCaptchaData(extraData);
                  }}
                  onError={() => {
                    setCaptchaToken("");
                    setCaptchaData(undefined);
                    toast.error(t("forgotPassword.turnstileError"));
                  }}
                  onExpire={() => {
                    setCaptchaToken("");
                    setCaptchaData(undefined);
                  }}
                />
              </div>
            )}
            <Button
              className="w-full"
              disabled={mutation.isPending || !email.trim()}
              onClick={() => {
                if (captchaConfig?.enabled && !captchaToken) {
                  toast.error(t("forgotPassword.turnstileRequired"));
                  return;
                }
                mutation.mutate({
                  email: email.trim(),
                  captchaToken,
                  captchaData,
                  captchaProvider: captchaConfig?.provider || undefined,
                });
              }}
            >
              {mutation.isPending ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
            </Button>
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
