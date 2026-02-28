import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";

import { register, fetchRegistrationStatus, sendVerificationCode } from "@/lib/api";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";

export function RegisterPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
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

  const {
    data: registrationStatus,
    isLoading: checkingStatus,
    error: statusError
  } = useQuery({
    queryKey: ["registration-status"],
    queryFn: fetchRegistrationStatus
  });

  const emailVerifyEnabled = registrationStatus?.emailVerifyEnabled ?? false;

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config"],
    queryFn: fetchTurnstileConfig,
  });

  // Load Turnstile script when enabled
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

  // 倒计时效果
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
      // 注册成功后自动登录
      if (data.token && data.user) {
        setAuth({ token: data.token, user: data.user });
        navigate("/dashboard", { replace: true });
      } else {
        // 如果没有返回token，跳转到登录页
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

  // 如果已登录，重定向到仪表板
  if (token) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  // 检查注册状态
  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (statusError || !registrationStatus?.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>注册已关闭</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              管理员已关闭用户注册功能。如需账号，请联系管理员。
            </p>
            <Button asChild className="w-full">
              <Link to="/login">返回登录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

    // 如果启用了Turnstile，需要先显示验证组件
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
    // 自动发送验证码
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

    // 只有启用邮件验证时才检查验证码
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

  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
  };

  const handleTurnstileExpire = () => {
    setTurnstileToken("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>注册账号</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">用户名</Label>
              <Input
                id="name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入用户名"
                required
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="请输入邮箱地址"
                required
                disabled={mutation.isPending || (emailVerifyEnabled && codeSent)}
              />
            </div>
            {emailVerifyEnabled && (
              <div className="space-y-2">
                <Label htmlFor="verificationCode">邮箱验证码</Label>
                <div className="flex gap-2">
                  <Input
                    id="verificationCode"
                    type="text"
                    value={form.verificationCode}
                    onChange={(e) => setForm({ ...form, verificationCode: e.target.value })}
                    placeholder="请输入6位验证码"
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
                  <p className="text-xs text-muted-foreground">
                    验证码已发送到您的邮箱，有效期5分钟
                  </p>
                )}
                {showSendCodeTurnstile && turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
                  <div className="rounded-md border p-4 space-y-2">
                    <p className="text-sm text-muted-foreground">请完成人机验证后发送验证码</p>
                    <div className="flex justify-center">
                      <Turnstile
                        ref={sendCodeTurnstileRef}
                        siteKey={turnstileConfig.siteKey}
                        onVerify={handleSendCodeTurnstileVerify}
                        onExpire={() => {
                          setSendCodeTurnstileToken("");
                        }}
                        onError={() => {
                          toast.error("人机验证失败，请刷新页面重试");
                          setSendCodeTurnstileToken("");
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="至少 8 个字符"
                required
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="再次输入密码"
                required
                disabled={mutation.isPending}
              />
            </div>
            {turnstileConfig?.enabled && turnstileConfig.siteKey && (
              <div className="flex justify-center">
                {turnstileReady ? (
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={turnstileConfig.siteKey}
                    onVerify={handleTurnstileVerify}
                    onExpire={handleTurnstileExpire}
                    onError={() => {
                      toast.error("人机验证失败，请刷新页面重试");
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">加载人机验证中...</p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "注册中..." : "注册"}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">已有账号？</span>{" "}
              <Link to="/login" className="text-primary hover:underline">
                立即登录
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
