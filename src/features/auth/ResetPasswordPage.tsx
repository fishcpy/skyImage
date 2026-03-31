import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { fetchResetPasswordStatus, fetchSiteConfig, resetPasswordByEmail } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n";

export function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);

  const token = searchParams.get("token")?.trim() ?? "";

  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });

  const { data: resetStatus, isLoading: checkingToken } = useQuery({
    queryKey: ["reset-password-status", token],
    queryFn: () => fetchResetPasswordStatus(token),
    enabled: Boolean(token)
  });

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config", "login"],
    queryFn: () => fetchTurnstileConfig("login"),
    enabled: !!resetStatus?.requiresTurnstile
  });

  useEffect(() => {
    if (resetStatus?.requiresTurnstile && turnstileConfig?.enabled && turnstileConfig.siteKey) {
      loadTurnstileScript()
        .then(() => setTurnstileReady(true))
        .catch(() => toast.error(t("resetPassword.loadTurnstileError")));
    }
  }, [resetStatus?.requiresTurnstile, t, turnstileConfig?.enabled, turnstileConfig?.siteKey]);

  const mutation = useMutation({
    mutationFn: resetPasswordByEmail,
    onSuccess: () => {
      toast.success(t("resetPassword.success"));
      navigate("/login", { replace: true });
    },
    onError: (error) => toast.error(error.message)
  });

  if (siteConfig && siteConfig.forgotPasswordEnabled === false) {
    return <Navigate to="/login" replace />;
  }

  if (token && checkingToken) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("resetPassword.checkingTitle")}</CardTitle>
            <CardDescription>{t("resetPassword.checkingDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!token || (!checkingToken && !resetStatus?.valid)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("resetPassword.invalidTitle")}</CardTitle>
            <CardDescription>{t("resetPassword.invalidDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password" className="text-sm underline underline-offset-4 hover:text-primary">
              {t("resetPassword.goForgot")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!code.trim()) {
      toast.error(t("resetPassword.codeRequired"));
      return;
    }
    if (password.length < 8) {
      toast.error(t("resetPassword.passwordLength"));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t("resetPassword.passwordMismatch"));
      return;
    }
    if (resetStatus?.requiresTurnstile && !turnstileToken) {
      toast.error(t("resetPassword.turnstileRequired"));
      return;
    }
    mutation.mutate({
      token,
      code: code.trim(),
      password,
      turnstileToken
    });
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="fixed right-4 top-4 z-10">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>{t("resetPassword.title")}</CardTitle>
            <CardDescription>{t("resetPassword.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{t("resetPassword.code")}</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("resetPassword.newPassword")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("resetPassword.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={mutation.isPending} onClick={handleSubmit}>
              {mutation.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
            </Button>
            {resetStatus?.requiresTurnstile && turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={turnstileConfig.siteKey}
                  onVerify={setTurnstileToken}
                  onError={() => {
                    setTurnstileToken("");
                    toast.error(t("resetPassword.turnstileError"));
                  }}
                  onExpire={() => setTurnstileToken("")}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
