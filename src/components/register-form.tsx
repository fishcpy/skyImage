import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
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
import { register, sendVerificationCode, fetchCaptchaConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { UnifiedCaptcha, type UnifiedCaptchaRef } from "@/components/UnifiedCaptcha";
import { OAuthButtons } from "@/components/OAuthButtons";
import { useI18n } from "@/i18n";

interface RegisterFormProps extends React.ComponentProps<"div"> {
  emailVerifyEnabled: boolean;
  showOAuth?: boolean;
}

export function RegisterForm({
  className,
  emailVerifyEnabled,
  showOAuth = false,
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
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const [captchaData, setCaptchaData] = useState<Record<string, string> | undefined>();
  const [sendCodeCaptchaToken, setSendCodeCaptchaToken] = useState<string>("");
  const [sendCodeCaptchaData, setSendCodeCaptchaData] = useState<Record<string, string> | undefined>();
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showSendCodeCaptcha, setShowSendCodeCaptcha] = useState(false);
  const captchaRef = useRef<UnifiedCaptchaRef>(null);
  const sendCodeCaptchaRef = useRef<UnifiedCaptchaRef>(null);

  const { data: captchaConfig } = useQuery({
    queryKey: ["captcha-config", "register"],
    queryFn: () => fetchCaptchaConfig("register"),
  });

  const { data: sendCodeCaptchaConfig, refetch: refetchSendCodeConfig } = useQuery({
    queryKey: ["captcha-config", "register_verify"],
    queryFn: () => fetchCaptchaConfig("register_verify"),
  });

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
      setShowSendCodeCaptcha(false);
      setSendCodeCaptchaToken("");
      setSendCodeCaptchaData(undefined);
    },
    onError: (error) => {
      toast.error(error.message || t("register.sendVerificationFailed"));
      if (sendCodeCaptchaRef.current) {
        sendCodeCaptchaRef.current.reset();
      }
      setSendCodeCaptchaToken("");
      setSendCodeCaptchaData(undefined);
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
      if (captchaRef.current) {
        captchaRef.current.reset();
      }
      setCaptchaToken("");
      setCaptchaData(undefined);
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

    // 重新获取最新的验证码配置
    const { data: latestConfig } = await refetchSendCodeConfig();

    if (latestConfig?.enabled && !sendCodeCaptchaToken) {
      setShowSendCodeCaptcha(true);
      return;
    }

    sendCodeMutation.mutate({
      email: form.email,
      captchaToken: sendCodeCaptchaToken,
      captchaData: sendCodeCaptchaData,
      captchaProvider: latestConfig?.provider || undefined,
    });
  };

  const handleSendCodeCaptchaVerify = (token: string, extraData?: Record<string, string>) => {
    setSendCodeCaptchaToken(token);
    setSendCodeCaptchaData(extraData);
    sendCodeMutation.mutate({
      email: form.email,
      captchaToken: token,
      captchaData: extraData,
      captchaProvider: sendCodeCaptchaConfig?.provider || undefined,
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

    if (captchaConfig?.enabled && !captchaToken) {
      toast.error(t("register.turnstileRequired"));
      return;
    }

    mutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      verificationCode: form.verificationCode,
      captchaToken,
      captchaData,
      captchaProvider: captchaConfig?.provider || undefined,
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
                  {showSendCodeCaptcha && sendCodeCaptchaConfig?.enabled && sendCodeCaptchaConfig.siteKey && sendCodeCaptchaConfig.provider && (
                    <div className="rounded-md border p-4 space-y-2">
                      <p className="text-sm text-muted-foreground">{t("register.sendCodeTurnstileHint")}</p>
                      <div className="flex justify-center">
                        <UnifiedCaptcha
                          ref={sendCodeCaptchaRef}
                          provider={sendCodeCaptchaConfig.provider as "cloudflare" | "geetest" | "cap"}
                          siteKey={sendCodeCaptchaConfig.siteKey}
                          apiEndpoint={sendCodeCaptchaConfig.apiEndpoint}
                          onVerify={handleSendCodeCaptchaVerify}
                          onExpire={() => {
                            setSendCodeCaptchaToken("");
                            setSendCodeCaptchaData(undefined);
                          }}
                          onError={() => {
                            toast.error(t("register.turnstileError"));
                            setSendCodeCaptchaToken("");
                            setSendCodeCaptchaData(undefined);
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
              {captchaConfig?.enabled && captchaConfig.siteKey && captchaConfig.provider && (
                <Field>
                  <div className="flex justify-center">
                    <UnifiedCaptcha
                      ref={captchaRef}
                      provider={captchaConfig.provider as "cloudflare" | "geetest" | "cap"}
                      siteKey={captchaConfig.siteKey}
                      apiEndpoint={captchaConfig.apiEndpoint}
                      onVerify={(token, extraData) => {
                        setCaptchaToken(token);
                        setCaptchaData(extraData);
                      }}
                      onExpire={() => {
                        setCaptchaToken("");
                        setCaptchaData(undefined);
                      }}
                      onError={() => {
                        toast.error(t("register.turnstileError"));
                        setCaptchaToken("");
                        setCaptchaData(undefined);
                      }}
                    />
                  </div>
                </Field>
              )}
              <Field>
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? t("register.submitting") : t("register.submit")}
                </Button>
                {showOAuth && <OAuthButtons />}
                <FieldDescription className="text-center">
                  {t("register.hasAccount")} <Link to="/login" className="text-primary hover:underline">{t("register.loginNow")}</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        {t("legal.continuePrefix")} <Link to="/terms" className="underline hover:text-primary">{t("legal.terms")}</Link>{" "}
        {t("legal.and")} <Link to="/privacy" className="underline hover:text-primary">{t("legal.privacy")}</Link>{t("legal.period")}
      </FieldDescription>
    </div>
  );
}
