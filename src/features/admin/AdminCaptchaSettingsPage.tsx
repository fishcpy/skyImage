import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, CheckCircle2, AlertTriangle, Loader2, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchSystemSettings,
  updateSystemSettings,
  testCaptchaConfig,
  type SystemSettingsInput,
  type SystemSettingsResponse
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { Turnstile, type TurnstileRef } from "@/components/Turnstile";
import { Geetest, type GeetestRef } from "@/components/Geetest";
import { loadTurnstileScript } from "@/lib/turnstile";
import { loadGeetestScript } from "@/lib/geetest";
import { useI18n } from "@/i18n";

type CaptchaProvider = "cloudflare" | "geetest" | "";

interface ProviderStatus {
  verified: boolean;
  lastVerifiedAt: string | null;
  canUse: boolean;
}

export function AdminCaptchaSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });

  const [form, setForm] = useState({
    // 全局开关
    enableCaptcha: false,
    captchaProvider: "" as CaptchaProvider,

    // Cloudflare Turnstile 配置
    cloudflareSiteKey: "",
    cloudflareSecretKey: "",

    // Geetest 配置
    geetestCaptchaId: "",
    geetestCaptchaKey: "",

    // 场景开关
    enableLoginCaptcha: false,
    enableRegisterCaptcha: false,
    enableRegisterVerifyCaptcha: false,
    enableForgotPasswordRequestCaptcha: false,
    enableForgotPasswordResetCaptcha: false,
  });

  const [providerStatus, setProviderStatus] = useState<{
    cloudflare: ProviderStatus;
    geetest: ProviderStatus;
  }>({
    cloudflare: { verified: false, lastVerifiedAt: null, canUse: false },
    geetest: { verified: false, lastVerifiedAt: null, canUse: false },
  });

  const [showTester, setShowTester] = useState<{
    cloudflare: boolean;
    geetest: boolean;
  }>({
    cloudflare: false,
    geetest: false,
  });

  const [turnstileReady, setTurnstileReady] = useState(false);
  const [geetestReady, setGeetestReady] = useState(false);
  const [initialForm, setInitialForm] = useState<typeof form | null>(null);
  const turnstileRef = useRef<TurnstileRef>(null);
  const geetestRef = useRef<GeetestRef>(null);

  useEffect(() => {
    if (data) {
      // 兼容旧的 Turnstile 配置
      const cloudflareSiteKey = data.cloudflareSiteKey || data.turnstileSiteKey || "";
      const cloudflareSecretKey = data.cloudflareSecretKey || data.turnstileSecretKey || "";
      const cloudflareVerified = data.cloudflareVerified || data.turnstileVerified || false;
      const cloudflareLastVerifiedAt = data.cloudflareLastVerifiedAt || data.turnstileLastVerifiedAt || null;

      const normalized = {
        enableCaptcha: data.enableCaptcha ?? (data.enableTurnstile || false),
        captchaProvider: (data.captchaProvider || (data.enableTurnstile ? "cloudflare" : "")) as CaptchaProvider,

        cloudflareSiteKey,
        cloudflareSecretKey,

        geetestCaptchaId: data.geetestCaptchaId || "",
        geetestCaptchaKey: data.geetestCaptchaKey || "",

        enableLoginCaptcha: data.enableLoginCaptcha ?? (data.enableLoginTurnstile || false),
        enableRegisterCaptcha: data.enableRegisterCaptcha ?? (data.enableRegisterTurnstile || false),
        enableRegisterVerifyCaptcha: data.enableRegisterVerifyCaptcha ?? (data.enableRegisterVerifyTurnstile || false),
        enableForgotPasswordRequestCaptcha: data.enableForgotPasswordRequestCaptcha ?? (data.enableForgotPasswordTurnstileRequest || false),
        enableForgotPasswordResetCaptcha: data.enableForgotPasswordResetCaptcha ?? (data.enableForgotPasswordTurnstileReset || false),
      };
      setForm(normalized);
      setInitialForm(normalized);

      // 设置提供商验证状态
      setProviderStatus({
        cloudflare: {
          verified: cloudflareVerified,
          lastVerifiedAt: cloudflareLastVerifiedAt,
          canUse: !!(cloudflareSiteKey && cloudflareSecretKey && cloudflareVerified),
        },
        geetest: {
          verified: data.geetestVerified || false,
          lastVerifiedAt: data.geetestLastVerifiedAt || null,
          canUse: !!(data.geetestCaptchaId && data.geetestCaptchaKey && data.geetestVerified),
        },
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (input: typeof form) => {
      const latest = await fetchSystemSettings();
      const next: SystemSettingsInput = {
        ...latest,
        enableCaptcha: input.enableCaptcha,
        captchaProvider: input.captchaProvider,
        cloudflareSiteKey: input.cloudflareSiteKey,
        cloudflareSecretKey: input.cloudflareSecretKey,
        geetestCaptchaId: input.geetestCaptchaId,
        geetestCaptchaKey: input.geetestCaptchaKey,
        enableLoginCaptcha: input.enableLoginCaptcha,
        enableRegisterCaptcha: input.enableRegisterCaptcha,
        enableRegisterVerifyCaptcha: input.enableRegisterVerifyCaptcha,
        enableForgotPasswordRequestCaptcha: input.enableForgotPasswordRequestCaptcha,
        enableForgotPasswordResetCaptcha: input.enableForgotPasswordResetCaptcha,
      };
      await updateSystemSettings(next);
      return input;
    },
    onSuccess: (savedForm) => {
      // 立即同步 initialForm，确保表单状态正确
      setInitialForm({ ...savedForm });
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      toast.success("人机验证配置已保存");
    },
    onError: (error) => toast.error(error.message)
  });

  const testCloudflareMutation = useMutation({
    mutationFn: testCaptchaConfig,
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Cloudflare Turnstile 验证成功");
        setProviderStatus(prev => ({
          ...prev,
          cloudflare: {
            verified: true,
            lastVerifiedAt: result.verifiedAt || new Date().toISOString(),
            canUse: true,
          }
        }));
        setShowTester(prev => ({ ...prev, cloudflare: false }));
      } else {
        setProviderStatus(prev => ({
          ...prev,
          cloudflare: { ...prev.cloudflare, verified: false, canUse: false }
        }));
        toast.error(result.message || "Cloudflare Turnstile 验证失败");
      }
    },
    onError: (error) => {
      setProviderStatus(prev => ({
        ...prev,
        cloudflare: { ...prev.cloudflare, verified: false, canUse: false }
      }));
      toast.error(error.message);
    }
  });

  const testGeetestMutation = useMutation({
    mutationFn: testCaptchaConfig,
    onSuccess: (result) => {
      if (result.success) {
        toast.success("极验验证成功");
        setProviderStatus(prev => ({
          ...prev,
          geetest: {
            verified: true,
            lastVerifiedAt: result.verifiedAt || new Date().toISOString(),
            canUse: true,
          }
        }));
        setShowTester(prev => ({ ...prev, geetest: false }));
      } else {
        setProviderStatus(prev => ({
          ...prev,
          geetest: { ...prev.geetest, verified: false, canUse: false }
        }));
        toast.error(result.message || "极验验证失败");
      }
    },
    onError: (error) => {
      setProviderStatus(prev => ({
        ...prev,
        geetest: { ...prev.geetest, verified: false, canUse: false }
      }));
      toast.error(error.message);
    }
  });

  if (isLoading) {
    return <SplashScreen message="加载中..." />;
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>加载失败</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleChange = (field: keyof typeof form, value: any) => {
    const actualValue = value === "indeterminate" ? false : value;

    // 如果修改了密钥，清除验证状态
    if (field === "cloudflareSiteKey" || field === "cloudflareSecretKey") {
      setProviderStatus(prev => ({
        ...prev,
        cloudflare: { verified: false, lastVerifiedAt: null, canUse: false }
      }));
    }
    if (field === "geetestCaptchaId" || field === "geetestCaptchaKey") {
      setProviderStatus(prev => ({
        ...prev,
        geetest: { verified: false, lastVerifiedAt: null, canUse: false }
      }));
    }

    // 如果要启用全局验证码，检查是否选择了提供商且已验证
    if (field === "enableCaptcha" && actualValue === true) {
      if (!form.captchaProvider) {
        toast.error("请先选择并测试一个人机验证提供商");
        return;
      }
      const status = providerStatus[form.captchaProvider];
      if (!status.canUse) {
        toast.error("请先完成选定提供商的配置测试");
        return;
      }
    }

    // 如果要选择提供商，检查是否已验证
    if (field === "captchaProvider" && actualValue && form.enableCaptcha) {
      if (actualValue === "cloudflare" || actualValue === "geetest") {
        const status = providerStatus[actualValue as "cloudflare" | "geetest"];
        if (!status?.canUse) {
          toast.error("所选提供商尚未通过测试，无法启用");
          return;
        }
      }
    }

    setForm((prev) => ({ ...prev, [field]: actualValue }));
  };

  const startCloudflareTest = () => {
    if (!form.cloudflareSiteKey || !form.cloudflareSecretKey) {
      toast.error("请先填写 Cloudflare Turnstile 的 Site Key 和 Secret Key");
      return;
    }
    setShowTester(prev => ({ ...prev, cloudflare: true }));
    setTurnstileReady(false);
    loadTurnstileScript()
      .then(() => setTurnstileReady(true))
      .catch(() => {
        toast.error("加载 Turnstile 脚本失败");
      });
  };

  const startGeetestTest = () => {
    if (!form.geetestCaptchaId || !form.geetestCaptchaKey) {
      toast.error("请先填写极验的 Captcha ID 和 Captcha Key");
      return;
    }

    // 验证 Captcha ID 格式
    const trimmedId = form.geetestCaptchaId.trim();
    if (trimmedId.length !== 32) {
      toast.error(`Captcha ID 长度不正确：应为 32 位，实际为 ${trimmedId.length} 位`);
      return;
    }

    if (!/^[a-f0-9]{32}$/i.test(trimmedId)) {
      toast.error("Captcha ID 格式不正确：应为 32 位十六进制字符");
      return;
    }

    setShowTester(prev => ({ ...prev, geetest: true }));
    setGeetestReady(false);
    loadGeetestScript()
      .then(() => setGeetestReady(true))
      .catch(() => {
        toast.error("加载极验脚本失败");
      });
  };

  const handleGeetestSuccess = (result: { lot_number: string; pass_token: string; gen_time: string; captcha_output: string }) => {
    testGeetestMutation.mutate({
      provider: "geetest" as const,
      captchaId: form.geetestCaptchaId,
      captchaKey: form.geetestCaptchaKey,
      token: result.lot_number,
      extraData: {
        challenge: result.lot_number,
        validate: result.pass_token,
        seccode: result.gen_time,
        captcha_output: result.captcha_output,
      }
    });
  };

  const handleGeetestError = (error?: string) => {
    toast.error(error || "极验初始化失败，请检查 Captcha ID 是否正确");
    setShowTester(prev => ({ ...prev, geetest: false }));
  };

  const handleCloudflareVerify = (token: string) => {
    testCloudflareMutation.mutate({
      provider: "cloudflare",
      siteKey: form.cloudflareSiteKey,
      secretKey: form.cloudflareSecretKey,
      token
    });
  };

  const isFormDirty = initialForm
    ? Object.keys(form).some((key) => initialForm[key as keyof typeof form] !== form[key as keyof typeof form])
    : false;

  const availableProviders: { value: CaptchaProvider; label: string; disabled: boolean }[] = [
    {
      value: "",
      label: "请选择提供商",
      disabled: false
    },
    {
      value: "cloudflare",
      label: providerStatus.cloudflare.canUse ? "Cloudflare Turnstile" : "Cloudflare Turnstile (未验证)",
      disabled: !providerStatus.cloudflare.canUse
    },
    {
      value: "geetest",
      label: providerStatus.geetest.canUse ? "极验 (Geetest)" : "极验 (Geetest) (未验证)",
      disabled: !providerStatus.geetest.canUse
    }
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">人机验证配置</h1>
        <p className="text-muted-foreground">
          统一配置人机验证服务，支持 Cloudflare Turnstile 和极验
        </p>
      </div>

      {/* 全局配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            全局配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableCaptcha"
              checked={form.enableCaptcha}
              onCheckedChange={(checked) => handleChange("enableCaptcha", checked)}
            />
            <Label htmlFor="enableCaptcha" className="font-medium">
              启用人机验证（总开关）
            </Label>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            开启后，可在下方选择具体的验证场景
          </p>

          <div className="space-y-2">
            <Label>人机验证提供商</Label>
            <Select
              value={form.captchaProvider}
              onValueChange={(value) => handleChange("captchaProvider", value as CaptchaProvider)}
              disabled={!form.enableCaptcha}
            >
              <SelectTrigger>
                <SelectValue placeholder="请先配置并测试提供商" />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map((provider) => (
                  <SelectItem
                    key={provider.value || "none"}
                    value={provider.value || "none"}
                    disabled={provider.disabled}
                  >
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              只能选择已通过测试的提供商，未通过测试的提供商显示为灰色
            </p>
          </div>

          {form.enableCaptcha && form.captchaProvider && (
            <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
              <Info className="h-4 w-4 flex-shrink-0" />
              <div>
                当前使用: <strong>{form.captchaProvider === "cloudflare" ? "Cloudflare Turnstile" : "极验 (Geetest)"}</strong>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 应用场景 */}
      <Card>
        <CardHeader>
          <CardTitle>应用场景</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground mb-4">
            选择需要人机验证的场景（需先启用全局开关）
          </p>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableLoginCaptcha"
                checked={form.enableLoginCaptcha}
                disabled={!form.enableCaptcha}
                onCheckedChange={(checked) => handleChange("enableLoginCaptcha", checked)}
              />
              <Label htmlFor="enableLoginCaptcha" className={!form.enableCaptcha ? "text-muted-foreground" : ""}>
                登录时需要验证
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableRegisterCaptcha"
                checked={form.enableRegisterCaptcha}
                disabled={!form.enableCaptcha}
                onCheckedChange={(checked) => handleChange("enableRegisterCaptcha", checked)}
              />
              <Label htmlFor="enableRegisterCaptcha" className={!form.enableCaptcha ? "text-muted-foreground" : ""}>
                注册时需要验证
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableRegisterVerifyCaptcha"
                checked={form.enableRegisterVerifyCaptcha}
                disabled={!form.enableCaptcha}
                onCheckedChange={(checked) => handleChange("enableRegisterVerifyCaptcha", checked)}
              />
              <Label htmlFor="enableRegisterVerifyCaptcha" className={!form.enableCaptcha ? "text-muted-foreground" : ""}>
                注册验证码发送时需要验证
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableForgotPasswordRequestCaptcha"
                checked={form.enableForgotPasswordRequestCaptcha}
                disabled={!form.enableCaptcha}
                onCheckedChange={(checked) => handleChange("enableForgotPasswordRequestCaptcha", checked)}
              />
              <Label htmlFor="enableForgotPasswordRequestCaptcha" className={!form.enableCaptcha ? "text-muted-foreground" : ""}>
                忘记密码请求时需要验证
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableForgotPasswordResetCaptcha"
                checked={form.enableForgotPasswordResetCaptcha}
                disabled={!form.enableCaptcha}
                onCheckedChange={(checked) => handleChange("enableForgotPasswordResetCaptcha", checked)}
              />
              <Label htmlFor="enableForgotPasswordResetCaptcha" className={!form.enableCaptcha ? "text-muted-foreground" : ""}>
                重置密码时需要验证
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cloudflare Turnstile 配置 */}
      <Card>
        <CardHeader>
          <CardTitle>Cloudflare Turnstile 配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Site Key</Label>
            <Input
              value={form.cloudflareSiteKey}
              onChange={(e) => handleChange("cloudflareSiteKey", e.target.value)}
              placeholder="0x4AAAAAAA..."
            />
          </div>
          <div className="space-y-2">
            <Label>Secret Key</Label>
            <Input
              type="password"
              value={form.cloudflareSecretKey}
              onChange={(e) => handleChange("cloudflareSecretKey", e.target.value)}
              placeholder="0x4AAAAAAA..."
            />
          </div>

          <div className="space-y-3 rounded-md border border-dashed p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">测试状态</p>
                <p className="text-xs text-muted-foreground">
                  {providerStatus.cloudflare.verified
                    ? `已验证 (${new Date(providerStatus.cloudflare.lastVerifiedAt!).toLocaleString()})`
                    : "需要测试"}
                </p>
              </div>
              {providerStatus.cloudflare.verified ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={startCloudflareTest}
              disabled={!form.cloudflareSiteKey || !form.cloudflareSecretKey || testCloudflareMutation.isPending}
              className="w-full"
            >
              {testCloudflareMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  验证中...
                </>
              ) : showTester.cloudflare ? (
                "重新测试"
              ) : providerStatus.cloudflare.verified ? (
                "重新测试"
              ) : (
                "开始测试"
              )}
            </Button>
            {showTester.cloudflare && (
              <div className="rounded-md border p-4 text-center space-y-3">
                {!turnstileReady && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载验证组件中...
                  </div>
                )}
                {turnstileReady && (
                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={form.cloudflareSiteKey}
                      onVerify={handleCloudflareVerify}
                      onError={() => toast.error("验证组件错误")}
                      onExpire={() => {}}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">获取密钥</p>
            <p className="text-muted-foreground">
              访问{" "}
              <a
                href="https://dash.cloudflare.com/?to=/:account/turnstile"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Cloudflare Turnstile
              </a>{" "}
              创建站点并获取 Site Key 和 Secret Key
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 极验配置 */}
      <Card>
        <CardHeader>
          <CardTitle>极验 (Geetest) 配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Captcha ID</Label>
            <Input
              value={form.geetestCaptchaId}
              onChange={(e) => handleChange("geetestCaptchaId", e.target.value.trim())}
              placeholder="输入极验 Captcha ID（32位十六进制）"
              className={form.geetestCaptchaId && form.geetestCaptchaId.length !== 32 ? "border-amber-500" : ""}
            />
            {form.geetestCaptchaId && form.geetestCaptchaId.length !== 32 && (
              <p className="text-xs text-amber-600">
                Captcha ID 应为 32 位字符，当前为 {form.geetestCaptchaId.length} 位
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Captcha Key</Label>
            <Input
              type="password"
              value={form.geetestCaptchaKey}
              onChange={(e) => handleChange("geetestCaptchaKey", e.target.value)}
              placeholder="输入极验 Captcha Key"
            />
          </div>

          <div className="space-y-3 rounded-md border border-dashed p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">测试状态</p>
                <p className="text-xs text-muted-foreground">
                  {providerStatus.geetest.verified
                    ? `已验证 (${new Date(providerStatus.geetest.lastVerifiedAt!).toLocaleString()})`
                    : "需要测试"}
                </p>
              </div>
              {providerStatus.geetest.verified ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={startGeetestTest}
              disabled={!form.geetestCaptchaId || !form.geetestCaptchaKey || testGeetestMutation.isPending}
              className="w-full"
            >
              {testGeetestMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  验证中...
                </>
              ) : (
                "开始测试"
              )}
            </Button>
            {showTester.geetest && (
              <div className="rounded-md border p-4 text-center space-y-3">
                {!geetestReady && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载验证组件中...
                  </div>
                )}
                {geetestReady && (
                  <div className="flex justify-center">
                    <Geetest
                      ref={geetestRef}
                      captchaId={form.geetestCaptchaId}
                      onSuccess={handleGeetestSuccess}
                      onError={handleGeetestError}
                      onReady={() => {}}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">获取密钥</p>
            <p className="text-muted-foreground">
              访问{" "}
              <a
                href="https://www.geetest.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                极验官网
              </a>{" "}
              注册并创建极验 4.0 验证实例
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? "有未保存的更改" : "所有更改已保存"}
        </p>
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || !isFormDirty}
        >
          {mutation.isPending ? "保存中..." : "保存配置"}
        </Button>
      </div>
    </div>
  );
}
