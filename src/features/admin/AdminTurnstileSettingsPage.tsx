import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchSystemSettings,
  updateSystemSettings,
  testTurnstileConfig,
  type SystemSettingsInput,
  type SystemSettingsResponse
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { Turnstile } from "@/components/Turnstile";
import { loadTurnstileScript } from "@/lib/turnstile";

export function AdminTurnstileSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });
  const [form, setForm] = useState({
    turnstileSiteKey: "",
    turnstileSecretKey: "",
    enableTurnstile: false,
    enableForgotPasswordTurnstileRequest: false,
    enableForgotPasswordTurnstileReset: false
  });
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileLastVerifiedAt, setTurnstileLastVerifiedAt] = useState<string | null>(null);
  const [showTurnstileTester, setShowTurnstileTester] = useState(false);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [turnstileScriptError, setTurnstileScriptError] = useState<string | null>(null);
  const [initialForm, setInitialForm] = useState<typeof form | null>(null);

  useEffect(() => {
    if (data) {
      const {
        turnstileVerified: verified,
        turnstileLastVerifiedAt,
        turnstileSiteKey,
        turnstileSecretKey,
        enableTurnstile,
        enableForgotPasswordTurnstileRequest,
        enableForgotPasswordTurnstileReset
      } = data;
      const normalized = {
        turnstileSiteKey: turnstileSiteKey || "",
        turnstileSecretKey: turnstileSecretKey || "",
        enableTurnstile: enableTurnstile || false,
        enableForgotPasswordTurnstileRequest: enableForgotPasswordTurnstileRequest || false,
        enableForgotPasswordTurnstileReset: enableForgotPasswordTurnstileReset || false
      };
      setForm(normalized);
      setInitialForm(normalized);
      setTurnstileVerified(verified);
      setTurnstileLastVerifiedAt(turnstileLastVerifiedAt || null);
      setShowTurnstileTester(false);
      setTurnstileReady(false);
      setTurnstileScriptError(null);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (input: SystemSettingsInput) => updateSystemSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["site-meta"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      toast.success("设置已更新");
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
    return <SplashScreen message="加载人机验证设置..." />;
  }
  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? "当前账户已被封禁，无法访问人机验证设置。"
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>无法加载人机验证设置</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleChange = (field: keyof typeof form, value: any) => {
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

  const lastVerifiedText = turnstileLastVerifiedAt
    ? new Date(turnstileLastVerifiedAt).toLocaleString()
    : "尚未验证";

  const canTestTurnstile = Boolean(form.turnstileSiteKey && form.turnstileSecretKey);

  const isFormDirty = initialForm
    ? Object.keys(form).some((key) => initialForm[key as keyof typeof form] !== form[key as keyof typeof form])
    : false;

  const handleSave = () => {
    if (!data) return;
    mutation.mutate({
      ...data,
      ...form
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">人机验证 (Turnstile)</h1>
        <p className="text-muted-foreground">配置 Cloudflare Turnstile 人机验证服务。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Turnstile 配置
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
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">忘记密码流程验证</p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableForgotPasswordTurnstileRequest"
                checked={form.enableForgotPasswordTurnstileRequest}
                onCheckedChange={(checked) => handleChange("enableForgotPasswordTurnstileRequest", checked)}
              />
              <Label htmlFor="enableForgotPasswordTurnstileRequest">
                重置密码发邮件需 Cloudflare 验证
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableForgotPasswordTurnstileReset"
                checked={form.enableForgotPasswordTurnstileReset}
                onCheckedChange={(checked) => handleChange("enableForgotPasswordTurnstileReset", checked)}
              />
              <Label htmlFor="enableForgotPasswordTurnstileReset">
                最终重置密码需 Cloudflare 验证
              </Label>
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
          onClick={handleSave}
          disabled={mutation.isPending || !isFormDirty}
        >
          {mutation.isPending ? "保存中..." : "保存所有更改"}
        </Button>
      </div>
    </div>
  );
}
