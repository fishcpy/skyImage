import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mail, Send, Shield, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchSystemSettings,
  updateSystemSettings,
  testSmtpEmail,
  testTurnstileConfig,
  type SystemSettingsInput,
  type SystemSettingsResponse
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { Turnstile } from "@/components/Turnstile";
import { loadTurnstileScript } from "@/lib/turnstile";

export function AdminSystemSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });
  const [form, setForm] = useState<SystemSettingsInput>({
    siteTitle: "",
    siteDescription: "",
    about: "",
    enableGallery: true,
    enableApi: true,
    allowRegistration: true,
    smtpHost: "",
    smtpPort: "",
    smtpUsername: "",
    smtpPassword: "",
    smtpSecure: false,
    enableRegisterVerify: false,
    enableLoginNotification: false,
    turnstileSiteKey: "",
    turnstileSecretKey: "",
    enableTurnstile: false,
    accountDisabledNotice: ""
  });
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileLastVerifiedAt, setTurnstileLastVerifiedAt] = useState<string | null>(null);
  const [showTurnstileTester, setShowTurnstileTester] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileScriptError, setTurnstileScriptError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [initialForm, setInitialForm] = useState<SystemSettingsInput | null>(null);

  // Calculate if form is dirty - must be before any conditional returns
  const isFormDirty = useMemo(() => {
    if (!initialForm) {
      return false;
    }
    const keys = Object.keys(initialForm) as (keyof SystemSettingsInput)[];
    return keys.some((key) => initialForm[key] !== form[key]);
  }, [initialForm, form]);

  useEffect(() => {
    if (data) {
      const {
        turnstileVerified: verified,
        turnstileLastVerifiedAt,
        ...rest
      } = data;
      setForm(rest);
      setInitialForm(rest);
      setTurnstileVerified(verified);
      setTurnstileLastVerifiedAt(turnstileLastVerifiedAt || null);
      setShowTurnstileTester(false);
      setTurnstileReady(false);
      setTurnstileScriptError(null);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["site-meta"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      toast.success("设置已更新");
    },
    onError: (error) => toast.error(error.message)
  });

  const testEmailMutation = useMutation({
    mutationFn: testSmtpEmail,
    onSuccess: (data) => {
      if (data.success) {
        toast.success("测试邮件发送成功！请检查收件箱");
        setTestEmail(""); // 清空测试邮箱输入
      } else {
        toast.error(data.message || "测试邮件发送失败");
      }
    },
    onError: (error) => toast.error(error.message)
  });

  const testTurnstileMutation = useMutation({
    mutationFn: testTurnstileConfig,
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Turnstile 配置验证通过");
        setTurnstileVerified(true);
        setTurnstileLastVerifiedAt(result.verifiedAt || new Date().toISOString());
        setShowTurnstileTester(false);
      } else {
        setTurnstileVerified(false);
        toast.error(result.message || "Turnstile 验证失败，请重试");
      }
    },
    onError: (error) => {
      setTurnstileVerified(false);
      toast.error(error.message);
    }
  });

  if (isLoading) {
    return <SplashScreen message="加载系统设置..." />;
  }
  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? "当前账户已被封禁，无法访问系统设置。"
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>无法加载系统设置</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleChange = (field: keyof SystemSettingsInput, value: any) => {
    const actualValue = value === "indeterminate" ? false : value;
    if (field === "turnstileSiteKey" || field === "turnstileSecretKey") {
      setTurnstileVerified(false);
      setTurnstileLastVerifiedAt(null);
    }
    if (field === "enableTurnstile" && actualValue === true && !turnstileVerified) {
      toast.error("请先完成下方的 Turnstile 测试并验证成功后再启用登录/注册人机验证");
      return;
    }
    setForm((prev) => ({ ...prev, [field]: actualValue }));
  };

  const startTurnstileTest = () => {
    if (!form.turnstileSiteKey || !form.turnstileSecretKey) {
      toast.error("请先填写完整的 Site Key 和 Secret Key");
      return;
    }
    setShowTurnstileTester(true);
    setTurnstileReady(false);
    setTurnstileScriptError(null);
    loadTurnstileScript()
      .then(() => setTurnstileReady(true))
      .catch((err) => {
        setTurnstileScriptError(err.message);
        toast.error("加载 Turnstile 组件失败，请检查网络环境");
      });
  };

  const handleTurnstileVerify = (token: string) => {
    if (!form.turnstileSiteKey || !form.turnstileSecretKey) {
      toast.error("Turnstile 配置不完整");
      return;
    }
    testTurnstileMutation.mutate({
      siteKey: form.turnstileSiteKey,
      secretKey: form.turnstileSecretKey,
      token
    });
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
      smtpSecure: form.smtpSecure
    });
  };

  const lastVerifiedText = turnstileLastVerifiedAt
    ? new Date(turnstileLastVerifiedAt).toLocaleString()
    : "尚未验证";

  const canTestTurnstile = Boolean(form.turnstileSiteKey && form.turnstileSecretKey);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="text-muted-foreground">
          修改站点标题和 SMTP 参数。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>站点标题</Label>
            <Input
              value={form.siteTitle}
              onChange={(e) => handleChange("siteTitle", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>描述</Label>
            <Input
              value={form.siteDescription}
              onChange={(e) => handleChange("siteDescription", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableGallery"
                checked={form.enableGallery}
                onCheckedChange={(checked) => handleChange("enableGallery", checked)}
              />
              <Label
                htmlFor="enableGallery"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                开启画廊
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableApi"
                checked={form.enableApi}
                onCheckedChange={(checked) => handleChange("enableApi", checked)}
              />
              <Label
                htmlFor="enableApi"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                开启 API
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allowRegistration"
                checked={form.allowRegistration}
                onCheckedChange={(checked) => handleChange("allowRegistration", checked)}
              />
              <Label
                htmlFor="allowRegistration"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                允许用户注册
              </Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>封禁账户提示语</Label>
            <Textarea
              value={form.accountDisabledNotice}
              onChange={(e) => handleChange("accountDisabledNotice", e.target.value)}
              minLength={4}
              maxLength={200}
              rows={3}
              placeholder="账户已被封禁，请联系管理员恢复访问。"
            />
            <p className="text-xs text-muted-foreground">
              该文案会展示在被禁用账户的仪表盘顶部和状态卡片上。
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>SMTP 配置</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Host</Label>
            <Input
              value={form.smtpHost}
              onChange={(e) => handleChange("smtpHost", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input
              value={form.smtpPort}
              onChange={(e) => handleChange("smtpPort", e.target.value)}
            />
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
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="smtpSecure"
                checked={form.smtpSecure}
                onCheckedChange={(checked) => handleChange("smtpSecure", checked)}
              />
              <Label
                htmlFor="smtpSecure"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                启用 TLS/SSL
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableRegisterVerify"
                checked={form.enableRegisterVerify}
                onCheckedChange={(checked) => handleChange("enableRegisterVerify", checked)}
              />
              <Label
                htmlFor="enableRegisterVerify"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                启用注册邮件验证
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableLoginNotification"
                checked={form.enableLoginNotification}
                onCheckedChange={(checked) => handleChange("enableLoginNotification", checked)}
              />
              <Label
                htmlFor="enableLoginNotification"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                登录邮件提醒
              </Label>
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
                  <Send className="h-4 w-4 mr-2" />
                  {testEmailMutation.isPending ? "发送中..." : "发送测试邮件"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            人机验证 (Turnstile)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>站点密钥 (Site Key)</Label>
            <Input
              value={form.turnstileSiteKey}
              onChange={(e) => handleChange("turnstileSiteKey", e.target.value)}
              placeholder="0x4AAAAAAA..."
            />
            <p className="text-xs text-muted-foreground">
              用于客户端渲染验证组件
            </p>
          </div>
          <div className="space-y-2">
            <Label>密钥 (Secret Key)</Label>
            <Input
              type="password"
              value={form.turnstileSecretKey}
              onChange={(e) => handleChange("turnstileSecretKey", e.target.value)}
              placeholder="0x4AAAAAAA..."
            />
            <p className="text-xs text-muted-foreground">
              用于服务端验证，请妥善保管
            </p>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="enableTurnstile"
              checked={form.enableTurnstile}
              onCheckedChange={(checked) => handleChange("enableTurnstile", checked)}
            />
            <div>
              <Label
                htmlFor="enableTurnstile"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                启用 Turnstile 人机验证
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                开启后登录与注册流程会强制进行 Turnstile 校验
              </p>
            </div>
          </div>
          <div className="rounded-md border border-dashed p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">测试状态</p>
                <p className="text-xs text-muted-foreground">
                  {turnstileVerified
                    ? `已通过测试：${lastVerifiedText}`
                    : "尚未验证，启用前必须先完成测试"}
                </p>
              </div>
              {turnstileVerified ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={startTurnstileTest}
                disabled={!canTestTurnstile || testTurnstileMutation.isPending}
                className="justify-center"
              >
                {testTurnstileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在验证...
                  </>
                ) : showTurnstileTester ? (
                  "重新加载测试"
                ) : turnstileVerified ? (
                  "重新测试配置"
                ) : (
                  "开始测试配置"
                )}
              </Button>
              {!canTestTurnstile && (
                <p className="text-xs text-muted-foreground">
                  请先填写 Site Key 与 Secret Key
                </p>
              )}
            </div>
            {showTurnstileTester && (
              <div className="rounded-md border border-dashed p-4 text-center space-y-3">
                {!turnstileReady && !turnstileScriptError && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载 Turnstile 组件...
                  </div>
                )}
                {turnstileScriptError && (
                  <p className="text-sm text-destructive">{turnstileScriptError}</p>
                )}
                {turnstileReady && !turnstileScriptError && (
                  <>
                    <div className="flex justify-center">
                      <Turnstile
                        siteKey={form.turnstileSiteKey}
                        onVerify={handleTurnstileVerify}
                        onError={() => {
                          toast.error("Turnstile 组件出现错误，请重试");
                        }}
                        onExpire={() => {}}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      验证成功后系统会自动提交测试请求
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">配置说明：</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                前往{" "}
                <a
                  href="https://dash.cloudflare.com/?to=/:account/turnstile"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Cloudflare Turnstile
                </a>{" "}
                创建站点
              </li>
              <li>获取站点密钥和密钥后填入上方</li>
              <li>启用后将在登录和注册页面显示验证</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? "有未保存的更改" : "未检测到配置更改"}
        </p>
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || !isFormDirty}
        >
          {mutation.isPending ? "保存中..." : "保存所有更改"}
        </Button>
      </div>
    </div>
  );
}
