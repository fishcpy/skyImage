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

export function ResetPasswordPage() {
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
        .catch(() => toast.error("加载人机验证失败"));
    }
  }, [resetStatus?.requiresTurnstile, turnstileConfig?.enabled, turnstileConfig?.siteKey]);

  const mutation = useMutation({
    mutationFn: resetPasswordByEmail,
    onSuccess: () => {
      toast.success("密码重置成功，请使用新密码登录");
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
            <CardTitle>正在校验链接</CardTitle>
            <CardDescription>请稍候...</CardDescription>
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
            <CardTitle>重置链接无效</CardTitle>
            <CardDescription>请重新发起忘记密码流程。</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/forgot-password" className="text-sm underline underline-offset-4 hover:text-primary">
              前往忘记密码
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!code.trim()) {
      toast.error("请输入验证码");
      return;
    }
    if (password.length < 8) {
      toast.error("密码必须至少 8 位");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (resetStatus?.requiresTurnstile && !turnstileToken) {
      toast.error("请完成人机验证");
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
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>重置密码</CardTitle>
            <CardDescription>请输入邮件中的验证码并设置新密码。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">验证码</Label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">新密码</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={mutation.isPending} onClick={handleSubmit}>
              {mutation.isPending ? "提交中..." : "重置密码"}
            </Button>
            {resetStatus?.requiresTurnstile && turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
              <div className="flex justify-center">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={turnstileConfig.siteKey}
                  onVerify={setTurnstileToken}
                  onError={() => {
                    setTurnstileToken("");
                    toast.error("人机验证出错，请重试");
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
