import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { toast } from "sonner";

import { login, fetchHasUsers } from "@/lib/api";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const setAuth = useAuthStore((state) => state.setAuth);
  const [form, setForm] = useState({ email: "", password: "" });
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);

  const {
    data: hasUsers,
    isLoading: checkingUsers,
    error,
    refetch
  } = useQuery({
    queryKey: ["auth", "has-users"],
    queryFn: fetchHasUsers
  });

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

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAuth(data);
      toast.success("登录成功");
      const redirect = (location.state as any)?.from?.pathname ?? "/dashboard";
      navigate(redirect, { replace: true });
    },
    onError: (error) => {
      // 汉化错误消息
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
      // Reset Turnstile on error
      setTurnstileToken("");
      if (turnstileRef.current) {
        turnstileRef.current.reset();
      }
    }
  });

  const handleLogin = () => {
    // 验证密码长度
    if (form.password.length < 8) {
      toast.error("密码必须至少8位");
      return;
    }
    // Check Turnstile token if enabled
    if (turnstileConfig?.enabled && !turnstileToken) {
      toast.error("请完成人机验证");
      return;
    }
    mutation.mutate({ ...form, turnstileToken });
  };

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!checkingUsers && hasUsers === false) {
    return <Navigate to="/installer" replace />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center">
        <p className="text-lg font-semibold">无法连接后端服务</p>
        <p className="text-sm text-muted-foreground">
          请确认 Go API 已启动并可通过 /api 访问。
        </p>
        <Button onClick={() => refetch()}>重试检测</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>登录</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkingUsers && (
            <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
              正在检测系统状态...
            </div>
          )}
          <div className="space-y-2">
            <Label>邮箱</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>密码</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
          </div>
          {turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
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
          )}
          <Button
            className="w-full"
            onClick={handleLogin}
            disabled={mutation.isPending || checkingUsers}
          >
            {mutation.isPending ? "登录中..." : "登录"}
          </Button>
          <div className="text-center text-sm">
            <span className="text-muted-foreground">还没有账号？</span>{" "}
            <a href="/register" className="text-primary hover:underline">
              立即注册
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
