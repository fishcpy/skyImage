import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";

import { fetchRegistrationStatus, fetchSiteConfig } from "@/lib/api";
import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RegisterForm } from "@/components/register-form";

export function RegisterPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);

  const {
    data: registrationStatus,
    isLoading: checkingStatus,
    error: statusError
  } = useQuery({
    queryKey: ["registration-status"],
    queryFn: fetchRegistrationStatus
  });

  const { data: siteConfig } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
  });

  const siteName = siteConfig?.title || "SkyImage";
  const emailVerifyEnabled = registrationStatus?.emailVerifyEnabled ?? false;

  if (token) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  if (checkingStatus) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">加载中...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (statusError || !registrationStatus?.allowed) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <a href="/" className="self-center font-medium text-xl">
            {siteName}
          </a>
          <Card>
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
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="self-center font-medium text-xl">
          {siteName}
        </a>
        <RegisterForm emailVerifyEnabled={emailVerifyEnabled} />
      </div>
    </div>
  );
}
