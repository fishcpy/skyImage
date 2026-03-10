import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchSystemSettings,
  updateSystemSettings,
  testSmtpEmail,
  type SystemSettingsInput,
  type SystemSettingsResponse
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";

const defaultSystemSettingsForm: SystemSettingsInput = {
  siteTitle: "",
  consoleUrl: "http://localhost:8080",
  siteDescription: "",
  siteSlogan: "",
  siteLogo: "",
  homeBadgeText: "",
  homeIntroText: "",
  homePrimaryCtaText: "",
  homeDashboardCtaText: "",
  homeSecondaryCtaText: "",
  homeFeature1Title: "",
  homeFeature1Desc: "",
  homeFeature2Title: "",
  homeFeature2Desc: "",
  homeFeature3Title: "",
  homeFeature3Desc: "",
  about: "",
  aboutTitle: "",
  notFoundMode: "template",
  notFoundHeading: "",
  notFoundText: "",
  notFoundHtml: "",
  termsOfService: "",
  privacyPolicy: "",
  enableGallery: true,
  enableHome: true,
  enableApi: true,
  imageLoadRows: 4,
  allowRegistration: true,
  smtpHost: "",
  smtpPort: "",
  smtpUsername: "",
  smtpPassword: "",
  smtpFrom: "",
  smtpSecure: false,
  enableRegisterVerify: false,
  enableLoginNotification: false,
  enableForgotPassword: false,
  enableForgotPasswordTurnstileRequest: false,
  enableForgotPasswordTurnstileReset: false,
  turnstileSiteKey: "",
  turnstileSecretKey: "",
  enableTurnstile: false,
  accountDisabledNotice: ""
};

const smtpFields: (keyof SystemSettingsInput)[] = [
  "smtpHost",
  "smtpPort",
  "smtpUsername",
  "smtpPassword",
  "smtpFrom",
  "smtpSecure",
  "enableRegisterVerify",
  "enableLoginNotification",
  "enableForgotPassword"
];

export function AdminSmtpSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });
  const [form, setForm] = useState<SystemSettingsInput>(defaultSystemSettingsForm);
  const [initialForm, setInitialForm] = useState<SystemSettingsInput | null>(null);
  const [testEmail, setTestEmail] = useState("");

  const isFormDirty = useMemo(() => {
    if (!initialForm) {
      return false;
    }
    return smtpFields.some((key) => initialForm[key] !== form[key]);
  }, [initialForm, form]);

  useEffect(() => {
    if (!data) return;
    const { turnstileVerified: _verified, turnstileLastVerifiedAt: _lastVerifiedAt, ...rest } = data;
    const normalized = {
      ...defaultSystemSettingsForm,
      ...rest
    };
    setForm(normalized);
    setInitialForm(normalized);
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["site-meta"] });
      toast.success("SMTP 配置已更新");
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  const testEmailMutation = useMutation({
    mutationFn: testSmtpEmail,
    onSuccess: (result) => {
      if (result.success) {
        toast.success("测试邮件发送成功，请检查收件箱");
        setTestEmail("");
      } else {
        toast.error(result.message || "测试邮件发送失败");
      }
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  if (isLoading) {
    return <SplashScreen message="加载 SMTP 配置..." />;
  }

  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? "当前账户已被封禁，无法访问 SMTP 配置。"
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>无法加载 SMTP 配置</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleChange = (field: keyof SystemSettingsInput, value: unknown) => {
    const actualValue = value === "indeterminate" ? false : value;
    setForm((prev) => ({ ...prev, [field]: actualValue as never }));
  };

  const handleTestEmail = () => {
    if (!testEmail) {
      toast.error("请输入测试邮箱地址");
      return;
    }
    if (!form.smtpHost || !form.smtpPort || !form.smtpUsername) {
      toast.error("请先填写完整的 SMTP 配置");
      return;
    }
    testEmailMutation.mutate({
      testEmail,
      smtpHost: form.smtpHost,
      smtpPort: form.smtpPort,
      smtpUsername: form.smtpUsername,
      smtpPassword: form.smtpPassword,
      smtpFrom: form.smtpFrom,
      smtpSecure: form.smtpSecure
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="text-muted-foreground">管理 SMTP 邮件服务与邮件相关开关。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SMTP 配置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Host</Label>
            <Input value={form.smtpHost} onChange={(e) => handleChange("smtpHost", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input value={form.smtpPort} onChange={(e) => handleChange("smtpPort", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>用户名</Label>
            <Input
              value={form.smtpUsername}
              onChange={(e) => handleChange("smtpUsername", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>密码 / 授权码</Label>
            <Input
              type="password"
              value={form.smtpPassword}
              onChange={(e) => handleChange("smtpPassword", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>发信邮箱</Label>
            <Input
              type="email"
              placeholder="noreply@yourdomain.com"
              value={form.smtpFrom}
              onChange={(e) => handleChange("smtpFrom", e.target.value)}
            />
          </div>
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="smtpSecure"
                checked={form.smtpSecure}
                onCheckedChange={(checked) => handleChange("smtpSecure", checked)}
              />
              <Label htmlFor="smtpSecure">启用 TLS/SSL</Label>
            </div>
          </div>
          <div className="md:col-span-2 mt-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                测试邮件发送
              </Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="输入测试邮箱地址"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={testEmailMutation.isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {testEmailMutation.isPending ? "发送中..." : "发送测试邮件"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>邮件通知设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableRegisterVerify"
              checked={form.enableRegisterVerify}
              onCheckedChange={(checked) => handleChange("enableRegisterVerify", checked)}
            />
            <Label htmlFor="enableRegisterVerify">启用注册邮件验证</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableLoginNotification"
              checked={form.enableLoginNotification}
              onCheckedChange={(checked) => handleChange("enableLoginNotification", checked)}
            />
            <Label htmlFor="enableLoginNotification">启用登录邮件提醒</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableForgotPassword"
              checked={form.enableForgotPassword}
              onCheckedChange={(checked) => handleChange("enableForgotPassword", checked)}
            />
            <Label htmlFor="enableForgotPassword">启用忘记密码</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? "有未保存的更改" : "未检测到配置更改"}
        </p>
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !isFormDirty}>
          {mutation.isPending ? "保存中..." : "保存 SMTP 配置"}
        </Button>
      </div>
    </div>
  );
}
