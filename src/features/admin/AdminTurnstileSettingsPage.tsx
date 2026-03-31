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
import { useI18n } from "@/i18n";

export function AdminTurnstileSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });
  const [form, setForm] = useState({
    turnstileSiteKey: "",
    turnstileSecretKey: "",
    enableTurnstile: false,
    enableLoginTurnstile: false,
    enableRegisterTurnstile: false,
    enableRegisterVerifyTurnstile: false,
    enableForgotPasswordTurnstile: false,
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
        enableLoginTurnstile,
        enableRegisterTurnstile,
        enableRegisterVerifyTurnstile,
        enableForgotPasswordTurnstile,
        enableForgotPasswordTurnstileRequest,
        enableForgotPasswordTurnstileReset
      } = data;
      const normalized = {
        turnstileSiteKey: turnstileSiteKey || "",
        turnstileSecretKey: turnstileSecretKey || "",
        enableTurnstile: enableTurnstile || false,
        enableLoginTurnstile: enableLoginTurnstile || false,
        enableRegisterTurnstile: enableRegisterTurnstile || false,
        enableRegisterVerifyTurnstile: enableRegisterVerifyTurnstile || false,
        enableForgotPasswordTurnstile: enableForgotPasswordTurnstile || false,
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
      toast.success(t("admin.turnstileSettings.saved"));
    },
    onError: (error) => toast.error(error.message)
  });

  const testTurnstileMutation = useMutation({
    mutationFn: testTurnstileConfig,
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t("admin.turnstileSettings.verifiedSuccess"));
        setTurnstileVerified(true);
        setTurnstileLastVerifiedAt(result.verifiedAt || new Date().toISOString());
        setShowTurnstileTester(false);
      } else {
        setTurnstileVerified(false);
        toast.error(result.message || t("admin.turnstileSettings.verifyFailed"));
      }
    },
    onError: (error) => {
      setTurnstileVerified(false);
      toast.error(error.message);
    }
  });

  if (isLoading) {
    return <SplashScreen message={t("admin.turnstileSettings.loading")} />;
  }
  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? t("admin.turnstileSettings.disabled")
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.turnstileSettings.loadFailed")}</CardTitle>
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
      toast.error(t("admin.turnstileSettings.requireVerifyBeforeEnable"));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: actualValue }));
  };

  const startTurnstileTest = () => {
    if (!form.turnstileSiteKey || !form.turnstileSecretKey) {
      toast.error(t("admin.turnstileSettings.keysRequired"));
      return;
    }
    setShowTurnstileTester(true);
    setTurnstileReady(false);
    setTurnstileScriptError(null);
    loadTurnstileScript()
      .then(() => setTurnstileReady(true))
      .catch((err) => {
        setTurnstileScriptError(err.message);
        toast.error(t("admin.turnstileSettings.loadScriptFailed"));
      });
  };

  const handleTurnstileVerify = (token: string) => {
    if (!form.turnstileSiteKey || !form.turnstileSecretKey) {
      toast.error(t("admin.turnstileSettings.configIncomplete"));
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
    : t("admin.turnstileSettings.unverified");

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
        <h1 className="text-2xl font-semibold">{t("admin.turnstileSettings.title")}</h1>
        <p className="text-muted-foreground">{t("admin.turnstileSettings.description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("admin.turnstileSettings.card")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("admin.turnstileSettings.siteKey")}</Label>
            <Input
              value={form.turnstileSiteKey}
              onChange={(e) => handleChange("turnstileSiteKey", e.target.value)}
              placeholder="0x4AAAAAAA..."
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.turnstileSettings.siteKeyHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.turnstileSettings.secretKey")}</Label>
            <Input
              type="password"
              value={form.turnstileSecretKey}
              onChange={(e) => handleChange("turnstileSecretKey", e.target.value)}
              placeholder="0x4AAAAAAA..."
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.turnstileSettings.secretKeyHint")}
            </p>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">{t("admin.turnstileSettings.loginRegister")}</p>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableLoginTurnstile"
                checked={form.enableLoginTurnstile}
                onCheckedChange={(checked) => handleChange("enableLoginTurnstile", checked)}
              />
              <Label htmlFor="enableLoginTurnstile">
                {t("admin.turnstileSettings.loginRequired")}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableRegisterTurnstile"
                checked={form.enableRegisterTurnstile}
                onCheckedChange={(checked) => handleChange("enableRegisterTurnstile", checked)}
              />
              <Label htmlFor="enableRegisterTurnstile">
                {t("admin.turnstileSettings.registerRequired")}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableRegisterVerifyTurnstile"
                checked={form.enableRegisterVerifyTurnstile}
                onCheckedChange={(checked) => handleChange("enableRegisterVerifyTurnstile", checked)}
              />
              <Label htmlFor="enableRegisterVerifyTurnstile">
                {t("admin.turnstileSettings.registerVerifyRequired")}
              </Label>
            </div>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableForgotPasswordTurnstile"
                checked={form.enableForgotPasswordTurnstile}
                onCheckedChange={(checked) => handleChange("enableForgotPasswordTurnstile", checked)}
              />
              <Label htmlFor="enableForgotPasswordTurnstile" className="font-medium">
                {t("admin.turnstileSettings.forgotRequired")}
              </Label>
            </div>
            <div className="ml-6 space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableForgotPasswordTurnstileRequest"
                  checked={form.enableForgotPasswordTurnstileRequest}
                  disabled={!form.enableForgotPasswordTurnstile}
                  onCheckedChange={(checked) => handleChange("enableForgotPasswordTurnstileRequest", checked)}
                />
                <Label 
                  htmlFor="enableForgotPasswordTurnstileRequest"
                  className={!form.enableForgotPasswordTurnstile ? "text-muted-foreground" : ""}
                >
                  {t("admin.turnstileSettings.forgotRequestRequired")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="enableForgotPasswordTurnstileReset"
                  checked={form.enableForgotPasswordTurnstileReset}
                  disabled={!form.enableForgotPasswordTurnstile}
                  onCheckedChange={(checked) => handleChange("enableForgotPasswordTurnstileReset", checked)}
                />
                <Label 
                  htmlFor="enableForgotPasswordTurnstileReset"
                  className={!form.enableForgotPasswordTurnstile ? "text-muted-foreground" : ""}
                >
                  {t("admin.turnstileSettings.forgotResetRequired")}
                </Label>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-dashed p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t("admin.turnstileSettings.testStatus")}</p>
                <p className="text-xs text-muted-foreground">
                  {turnstileVerified
                    ? t("admin.turnstileSettings.testPassedAt", { value: lastVerifiedText })
                    : t("admin.turnstileSettings.testRequired")}
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
                    {t("admin.turnstileSettings.verifying")}
                  </>
                ) : showTurnstileTester ? (
                  t("admin.turnstileSettings.reloadTest")
                ) : turnstileVerified ? (
                  t("admin.turnstileSettings.retest")
                ) : (
                  t("admin.turnstileSettings.startTest")
                )}
              </Button>
              {!canTestTurnstile && (
                <p className="text-xs text-muted-foreground">
                  {t("admin.turnstileSettings.keysHint")}
                </p>
              )}
            </div>
            {showTurnstileTester && (
              <div className="rounded-md border border-dashed p-4 text-center space-y-3">
                {!turnstileReady && !turnstileScriptError && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("admin.turnstileSettings.loadingWidget")}
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
                          toast.error(t("admin.turnstileSettings.widgetError"));
                        }}
                        onExpire={() => {}}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("admin.turnstileSettings.autoSubmitHint")}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium mb-1">{t("admin.turnstileSettings.guideTitle")}</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                {t("admin.turnstileSettings.goTo")}{" "}
                <a
                  href="https://dash.cloudflare.com/?to=/:account/turnstile"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Cloudflare Turnstile
                </a>{" "}
                {t("admin.turnstileSettings.createSite")}
              </li>
              <li>{t("admin.turnstileSettings.guideStep1")}</li>
              <li>{t("admin.turnstileSettings.guideStep2")}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? t("admin.systemSettings.unsaved") : t("admin.systemSettings.clean")}
        </p>
        <Button
          onClick={handleSave}
          disabled={mutation.isPending || !isFormDirty}
        >
          {mutation.isPending ? t("common.saving") : t("admin.systemSettings.saveAll")}
        </Button>
      </div>
    </div>
  );
}
