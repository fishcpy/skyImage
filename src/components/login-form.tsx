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

export function LoginForm({
  forgotPasswordEnabled = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { forgotPasswordEnabled?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "skyimage-disabled-notice";
    if (window.sessionStorage.getItem(key) === "1") {
      window.sessionStorage.removeItem(key);
      toast.error("账户已被封禁");
    }
  }, []);

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
          toast.error("加载人机验证失败");
        });
    }
  }, [turnstileConfig]);

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAuth({ user: data.user });
      toast.success("登录成功");
      const redirect = (location.state as any)?.from?.pathname ?? "/dashboard";
      navigate(redirect, { replace: true });
    },
    onError: (error) => {
      let message = error.message;
      if (message === "account disabled") {
        message = "账户已被禁用";
      } else if (message === "invalid credentials") {
        message = "邮箱/密码不正确";
      } else if (message === "turnstile token required") {
        message = "请完成人机验证";
      } else if (message === "turnstile verification failed") {
        message = "人机验证失败，请重试";
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
      toast.error("密码必须至少8位");
      return;
    }
    if (turnstileConfig?.enabled && !turnstileToken) {
      toast.error("请完成人机验证");
      return;
    }
    mutation.mutate({ ...form, turnstileToken });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">欢迎回来</CardTitle>
          <CardDescription>使用邮箱登录您的账户</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">邮箱</FieldLabel>
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
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  {forgotPasswordEnabled && (
                    <Link to="/forgot-password" className="ml-auto text-sm underline-offset-4 hover:underline">
                      忘记密码？
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
                        toast.error("人机验证出错，请刷新页面重试");
                      }}
                      onExpire={() => {
                        setTurnstileToken("");
                        toast.warning("人机验证已过期，请重新验证");
                      }}
                    />
                  </div>
                </Field>
              )}
              <Field>
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? "登录中..." : "登录"}
                </Button>
                <FieldDescription className="text-center">
                  还没有账号？ <a href="/register" className="text-primary hover:underline">立即注册</a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        继续即表示您同意我们的 <a href="/terms" className="underline hover:text-primary">服务条款</a>{" "}
        和 <a href="/privacy" className="underline hover:text-primary">隐私政策</a>。
      </FieldDescription>
    </div>
  );
}
