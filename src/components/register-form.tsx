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
    queryKey: ["turnstile-config"],
    queryFn: fetchTurnstileConfig,
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

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCodeMutation = useMutation({
    mutationFn: sendVerificationCode,
    onSuccess: () => {
      toast.success("验证码已发送，请查收邮件");
      setCodeSent(true);
      setCountdown(60);
      setShowSendCodeTurnstile(false);
      setSendCodeTurnstileToken("");
    },
    onError: (error) => {
      toast.error(error.message || "发送验证码失败");
      if (sendCodeTurnstileRef.current) {
        sendCodeTurnstileRef.current.reset();
      }
      setSendCodeTurnstileToken("");
    },
  });

  const mutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      toast.success("注册成功！正在跳转...");
      if (data.user) {
        setAuth({ user: data.user });
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    },
    onError: (error) => {
      toast.error(error.message || "注册失败");
      if (turnstileRef.current) {
        turnstileRef.current.reset();
      }
      setTurnstileToken("");
    },
  });

  const handleSendCode = () => {
    if (!form.email) {
      toast.error("请先输入邮箱地址");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      toast.error("请输入有效的邮箱地址");
      return;
    }

    if (turnstileConfig?.enabled && !sendCodeTurnstileToken) {
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
      toast.error("请填写所有必填字段");
      return;
    }

    if (form.password.length < 8) {
      toast.error("密码至少需要 8 个字符");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    if (emailVerifyEnabled && !form.verificationCode) {
      toast.error("请输入邮箱验证码");
      return;
    }

    if (turnstileConfig?.enabled && !turnstileToken) {
      toast.error("请完成人机验证");
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
          <CardTitle className="text-xl">创建账户</CardTitle>
          <CardDescription>输入您的信息以创建账户</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">用户名</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  placeholder="请输入用户名"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  disabled={mutation.isPending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">邮箱</FieldLabel>
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
                  <FieldLabel htmlFor="verificationCode">邮箱验证码</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="verificationCode"
                      type="text"
                      placeholder="请输入6位验证码"
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
                        ? "发送中..."
                        : countdown > 0
                        ? `${countdown}秒`
                        : codeSent
                        ? "重新发送"
                        : "发送验证码"}
                    </Button>
                  </div>
                  {codeSent && (
                    <FieldDescription>
                      验证码已发送到您的邮箱，有效期5分钟
                    </FieldDescription>
                  )}
                  {showSendCodeTurnstile && turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
                    <div className="rounded-md border p-4 space-y-2">
                      <p className="text-sm text-muted-foreground">请完成人机验证后发送验证码</p>
                      <div className="flex justify-center">
                        <Turnstile
                          ref={sendCodeTurnstileRef}
                          siteKey={turnstileConfig.siteKey}
                          onVerify={handleSendCodeTurnstileVerify}
                          onExpire={() => setSendCodeTurnstileToken("")}
                          onError={() => {
                            toast.error("人机验证失败，请刷新页面重试");
                            setSendCodeTurnstileToken("");
                          }}
                        />
                      </div>
                    </div>
                  )}
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="至少 8 个字符"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  disabled={mutation.isPending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">确认密码</FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="再次输入密码"
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
                          toast.error("人机验证失败，请刷新页面重试");
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">加载人机验证中...</p>
                    )}
                  </div>
                </Field>
              )}
              <Field>
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? "注册中..." : "注册"}
                </Button>
                <FieldDescription className="text-center">
                  已有账号？ <a href="/login" className="text-primary hover:underline">立即登录</a>
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
