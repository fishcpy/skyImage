import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { toast } from "sonner";

import { requestPasswordReset, fetchSiteConfig } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";
import { fetchTurnstileConfig, loadTurnstileScript } from "@/lib/turnstile";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileRef = useRef<TurnstileRef>(null);
  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig
  });
  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config"],
    queryFn: fetchTurnstileConfig
  });

  useEffect(() => {
    if (siteConfig?.forgotPasswordTurnstileRequest && turnstileConfig?.enabled && turnstileConfig.siteKey) {
      loadTurnstileScript()
        .then(() => setTurnstileReady(true))
        .catch(() => {
          toast.error("加载人机验证失败");
        });
    }
  }, [siteConfig?.forgotPasswordTurnstileRequest, turnstileConfig?.enabled, turnstileConfig?.siteKey]);

  const mutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      toast.success("如果邮箱存在，重置邮件已发送");
    },
    onError: (error) => toast.error(error.message)
  });

  if (siteConfig && siteConfig.forgotPasswordEnabled === false) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>忘记密码</CardTitle>
            <CardDescription>输入注册邮箱，我们会发送重置验证码与链接。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@example.com"
              />
            </div>
            <Button
              className="w-full"
              disabled={mutation.isPending || !email.trim()}
              onClick={() => {
                if (siteConfig?.forgotPasswordTurnstileRequest && !turnstileToken) {
                  toast.error("请完成人机验证");
                  return;
                }
                mutation.mutate({ email: email.trim(), turnstileToken });
              }}
            >
              {mutation.isPending ? "发送中..." : "发送重置邮件"}
            </Button>
            {siteConfig?.forgotPasswordTurnstileRequest && turnstileConfig?.enabled && turnstileConfig.siteKey && turnstileReady && (
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
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="underline underline-offset-4 hover:text-primary">
                返回登录
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
