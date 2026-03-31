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
import { useI18n } from "@/i18n";

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
  enableForgotPasswordTurnstile: false,
  enableForgotPasswordTurnstileRequest: false,
  enableForgotPasswordTurnstileReset: false,
  turnstileSiteKey: "",
  turnstileSecretKey: "",
  enableTurnstile: false,
  enableLoginTurnstile: false,
  enableRegisterTurnstile: false,
  enableRegisterVerifyTurnstile: false,
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
  const { t } = useI18n();
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
      toast.success(t("admin.smtpSettings.saved"));
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  const testEmailMutation = useMutation({
    mutationFn: testSmtpEmail,
    onSuccess: (result) => {
      if (result.success) {
        toast.success(t("admin.smtpSettings.testMailSuccess"));
        setTestEmail("");
      } else {
        toast.error(result.message || t("admin.smtpSettings.testMailFailed"));
      }
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  if (isLoading) {
    return <SplashScreen message={t("admin.smtpSettings.loading")} />;
  }

  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? t("admin.smtpSettings.disabled")
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.smtpSettings.loadFailed")}</CardTitle>
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
      toast.error(t("admin.smtpSettings.testMailRequired"));
      return;
    }
    if (!form.smtpHost || !form.smtpPort || !form.smtpUsername) {
      toast.error(t("admin.smtpSettings.configRequired"));
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
        <h1 className="text-2xl font-semibold">{t("nav.systemSettings")}</h1>
        <p className="text-muted-foreground">{t("admin.smtpSettings.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.smtpSettings.card")}</CardTitle>
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
            <Label>{t("admin.smtpSettings.username")}</Label>
            <Input
              value={form.smtpUsername}
              onChange={(e) => handleChange("smtpUsername", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.smtpSettings.password")}</Label>
            <Input
              type="password"
              value={form.smtpPassword}
              onChange={(e) => handleChange("smtpPassword", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.smtpSettings.from")}</Label>
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
              <Label htmlFor="smtpSecure">{t("admin.smtpSettings.secure")}</Label>
            </div>
          </div>
          <div className="md:col-span-2 mt-4 border-t pt-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {t("admin.smtpSettings.testMail")}
              </Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder={t("admin.smtpSettings.testMailPlaceholder")}
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
                  {testEmailMutation.isPending ? t("admin.smtpSettings.testMailSending") : t("admin.smtpSettings.testMailSend")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.smtpSettings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableRegisterVerify"
              checked={form.enableRegisterVerify}
              onCheckedChange={(checked) => handleChange("enableRegisterVerify", checked)}
            />
            <Label htmlFor="enableRegisterVerify">{t("admin.smtpSettings.enableRegisterVerify")}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableLoginNotification"
              checked={form.enableLoginNotification}
              onCheckedChange={(checked) => handleChange("enableLoginNotification", checked)}
            />
            <Label htmlFor="enableLoginNotification">{t("admin.smtpSettings.enableLoginNotification")}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="enableForgotPassword"
              checked={form.enableForgotPassword}
              onCheckedChange={(checked) => handleChange("enableForgotPassword", checked)}
            />
            <Label htmlFor="enableForgotPassword">{t("admin.smtpSettings.enableForgotPassword")}</Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? t("admin.systemSettings.unsaved") : t("admin.systemSettings.clean")}
        </p>
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !isFormDirty}>
          {mutation.isPending ? t("common.saving") : t("admin.smtpSettings.save")}
        </Button>
      </div>
    </div>
  );
}
