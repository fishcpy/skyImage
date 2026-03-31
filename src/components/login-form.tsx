import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
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
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { useAuthStore } from "@/state/auth";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";
import { useI18n } from "@/i18n";

export function LoginForm({
  forgotPasswordEnabled = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { forgotPasswordEnabled?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { t } = useI18n();
  const [form, setForm] = useState({ email: "", password: "" });
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "skyimage-disabled-notice";
    if (window.sessionStorage.getItem(key) === "1") {
      window.sessionStorage.removeItem(key);
      toast.error(t("login.disabledNotice"));
    }
  }, [t]);

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config", "login"],
    queryFn: () => fetchTurnstileConfig("login"),
  });

  useEffect(() => {
    if (turnstileConfig?.enabled && turnstileConfig.siteKey) {
      loadTurnstileScript()
        .then(() => setTurnstileReady(true))
        .catch((err) => {
          console.error("Failed to load Turnstile:", err);
          toast.error(t("login.turnstileLoadError"));
        });
    }
  }, [t, turnstileConfig]);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAuth({ user: data.user });
      toast.success(t("login.success"));
      const redirect = (location.state as any)?.from?.pathname ?? "/dashboard";
      navigate(redirect, { replace: true });
    },
    onError: (error) => {
      let message = error.message;
      if (message === "account disabled") {
        message = t("login.error.accountDisabled");
      } else if (message === "invalid credentials") {
        message = t("login.error.invalidCredentials");
      } else if (message === "turnstile token required") {
        message = t("login.error.turnstileRequired");
      } else if (message === "turnstile verification failed") {
        message = t("login.error.turnstileFailed");
      }
      toast.error(message);
      setTurnstileToken("");
      if (turnstileRef.current) {
        turnstileRef.current.reset();
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error(t("login.error.passwordLength"));
      return;
    }
    if (turnstileConfig?.enabled && !turnstileToken) {
      toast.error(t("login.error.turnstileRequired"));
      return;
    }
    mutation.mutate({ ...form, turnstileToken });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">{t("login.email")}</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
                  {forgotPasswordEnabled && (
                    <Link to="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
                      {t("login.forgotPassword")}
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </Field>
              {turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
                <Field>
                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={turnstileConfig.siteKey}
                      onVerify={setTurnstileToken}
                      onError={() => {
                        setTurnstileToken("");
                        toast.error(t("login.turnstileError"));
                      }}
                      onExpire={() => {
                        setTurnstileToken("");
                        toast.warning(t("login.turnstileExpired"));
                      }}
                    />
                  </div>
                </Field>
              )}
              <Field>
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? t("login.submitting") : t("login.submit")}
                </Button>
                <FieldDescription className="text-center">
                  {t("login.noAccount")} <a href="/register" className="text-primary hover:underline">{t("login.registerNow")}</a>
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
