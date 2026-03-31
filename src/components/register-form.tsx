import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { register, sendVerificationCode } from "@/lib/api";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { useAuthStore } from "@/state/auth";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";
import { useI18n } from "@/i18n";

interface RegisterFormProps extends React.ComponentProps<"div"> {
  emailVerifyEnabled: boolean;
}

export function RegisterForm({
  className,
  emailVerifyEnabled,
  ...props
}: RegisterFormProps) {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    verificationCode: ""
  });
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [sendCodeTurnstileToken, setSendCodeTurnstileToken] = useState<string>("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showSendCodeTurnstile, setShowSendCodeTurnstile] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);
  const sendCodeTurnstileRef = useRef<TurnstileRef>(null);

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config", "register"],
    queryFn: () => fetchTurnstileConfig("register"),
  });

  const { data: sendCodeTurnstileConfig, refetch: refetchSendCodeConfig } = useQuery({
    queryKey: ["turnstile-config", "register_verify"],
    queryFn: () => fetchTurnstileConfig("register_verify"),
  });

  useEffect(() => {
    if (turnstileConfig?.enabled && turnstileConfig.siteKey) {
      loadTurnstileScript()
        .then(() => setTurnstileReady(true))
        .catch((err) => {
          console.error("Failed to load Turnstile:", err);
          toast.error(t("register.loadTurnstileError"));
        });
    }
  }, [t, turnstileConfig]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCodeMutation = useMutation({
    mutationFn: sendVerificationCode,
    onSuccess: () => {
      toast.success(t("register.verificationSent"));
      setCodeSent(true);
      setCountdown(60);
      setShowSendCodeTurnstile(false);
      setSendCodeTurnstileToken("");
    },
    onError: (error) => {
      toast.error(error.message || t("register.sendVerificationFailed"));
      if (sendCodeTurnstileRef.current) {
        sendCodeTurnstileRef.current.reset();
      }
      setSendCodeTurnstileToken("");
    },
  });

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      toast.success(t("register.success"));
      if (data.user) {
        setAuth({ user: data.user });
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    },
    onError: (error) => {
      toast.error(error.message || t("register.failed"));
      if (turnstileRef.current) {
        turnstileRef.current.reset();
      }
      setTurnstileToken("");
    },
  });

  const handleSendCode = async () => {
    if (!form.email) {
      toast.error(t("register.emailRequired"));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      toast.error(t("register.emailInvalid"));
      return;
    }

    // 重新获取最新的 Turnstile 配置
    const { data: latestConfig } = await refetchSendCodeConfig();

    if (latestConfig?.enabled && !sendCodeTurnstileToken) {
      setShowSendCodeTurnstile(true);
      return;
    }

    sendCodeMutation.mutate({
      email: form.email,
      turnstileToken: sendCodeTurnstileToken
    });
  };

  const handleSendCodeTurnstileVerify = (token: string) => {
    setSendCodeTurnstileToken(token);
    sendCodeMutation.mutate({
      email: form.email,
      turnstileToken: token
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name || !form.email || !form.password) {
      toast.error(t("register.required"));
      return;
    }

    if (form.password.length < 8) {
      toast.error(t("register.passwordLength"));
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error(t("register.passwordMismatch"));
      return;
    }

    if (emailVerifyEnabled && !form.verificationCode) {
      toast.error(t("register.codeRequired"));
      return;
    }

    if (turnstileConfig?.enabled && !turnstileToken) {
      toast.error(t("register.turnstileRequired"));
      return;
    }

    mutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      verificationCode: form.verificationCode,
      turnstileToken: turnstileToken || undefined,
    });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("register.title")}</CardTitle>
          <CardDescription>{t("register.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">{t("register.username")}</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  placeholder={t("register.usernamePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  disabled={mutation.isPending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">{t("register.email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  disabled={mutation.isPending || (emailVerifyEnabled && codeSent)}
                />
              </Field>
              {emailVerifyEnabled && (
                <Field>
                  <FieldLabel htmlFor="verificationCode">{t("register.code")}</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="verificationCode"
                      type="text"
                      placeholder={t("register.codePlaceholder")}
                      value={form.verificationCode}
                      onChange={(e) => setForm({ ...form, verificationCode: e.target.value })}
                      maxLength={6}
                      required
                      disabled={mutation.isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendCode}
                      disabled={sendCodeMutation.isPending || countdown > 0 || !form.email}
                      className="whitespace-nowrap"
                    >
                      {sendCodeMutation.isPending
                        ? t("register.sending")
                        : countdown > 0
                        ? t("register.resendIn", { count: countdown })
                        : codeSent
                        ? t("register.resend")
                        : t("register.sendCode")}
                    </Button>
                  </div>
                  {codeSent && (
                    <FieldDescription>
                      {t("register.codeSentNotice")}
                    </FieldDescription>
                  )}
                  {showSendCodeTurnstile && sendCodeTurnstileConfig?.enabled && sendCodeTurnstileConfig.siteKey && turnstileReady && (
                    <div className="rounded-md border p-4 space-y-2">
                      <p className="text-sm text-muted-foreground">{t("register.sendCodeTurnstileHint")}</p>
                      <div className="flex justify-center">
                        <Turnstile
                          ref={sendCodeTurnstileRef}
                          siteKey={sendCodeTurnstileConfig.siteKey}
                          onVerify={handleSendCodeTurnstileVerify}
                          onExpire={() => setSendCodeTurnstileToken("")}
                          onError={() => {
                            toast.error(t("register.turnstileError"));
                            setSendCodeTurnstileToken("");
                          }}
                        />
                      </div>
                    </div>
                  )}
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="password">{t("register.password")}</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("register.passwordPlaceholder")}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  disabled={mutation.isPending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">{t("register.confirmPassword")}</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t("register.confirmPasswordPlaceholder")}
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  required
                  disabled={mutation.isPending}
                />
              </Field>
              {turnstileConfig?.enabled && turnstileConfig.siteKey && (
                <Field>
                  <div className="flex justify-center">
                    {turnstileReady ? (
                      <Turnstile
                        ref={turnstileRef}
                        siteKey={turnstileConfig.siteKey}
                        onVerify={setTurnstileToken}
                        onExpire={() => setTurnstileToken("")}
                        onError={() => {
                          toast.error(t("register.turnstileError"));
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("register.turnstileLoading")}</p>
                    )}
                  </div>
                </Field>
              )}
              <Field>
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? t("register.submitting") : t("register.submit")}
                </Button>
                <FieldDescription className="text-center">
                  {t("register.hasAccount")} <a href="/login" className="text-primary hover:underline">{t("register.loginNow")}</a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        {t("legal.continuePrefix")} <a href="/terms" className="underline hover:text-primary">{t("legal.terms")}</a>{" "}
        {t("legal.and")} <a href="/privacy" className="underline hover:text-primary">{t("legal.privacy")}</a>{t("legal.period")}
      </FieldDescription>
    </div>
  );
}
