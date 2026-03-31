import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  fetchSystemSettings,
  updateSystemSettings,
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

export function AdminSystemSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });
  const [form, setForm] = useState<SystemSettingsInput>(defaultSystemSettingsForm);
  const [initialForm, setInitialForm] = useState<SystemSettingsInput | null>(null);

  // Calculate if form is dirty - must be before any conditional returns
  const isFormDirty = useMemo(() => {
    if (!initialForm) {
      return false;
    }
    const keys = Object.keys(defaultSystemSettingsForm) as (keyof SystemSettingsInput)[];
    return keys.some((key) => initialForm[key] !== form[key]);
  }, [initialForm, form]);

  useEffect(() => {
    if (data) {
      const normalized = {
        ...defaultSystemSettingsForm,
        ...data
      };
      setForm(normalized);
      setInitialForm(normalized);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["site-meta"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      toast.success(t("admin.systemSettings.saved"));
    },
    onError: (error) => toast.error(error.message)
  });


  if (isLoading) {
    return <SplashScreen message={t("admin.systemSettings.loading")} />;
  }
  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? t("admin.systemSettings.disabled")
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.systemSettings.loadFailed")}</CardTitle>
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
    setForm((prev) => ({ ...prev, [field]: actualValue }));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{t("admin.systemSettings.title")}</h1>
        <p className="text-muted-foreground">{t("admin.systemSettings.description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.systemSettings.imageLoad")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>{t("admin.systemSettings.imageLoadRows")}</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={form.imageLoadRows}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              handleChange("imageLoadRows", Number.isNaN(value) ? 1 : value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("admin.systemSettings.imageLoadRowsHint")}
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? t("admin.systemSettings.unsaved") : t("admin.systemSettings.clean")}
        </p>
        <Button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || !isFormDirty}
        >
          {mutation.isPending ? t("common.saving") : t("admin.systemSettings.saveAll")}
        </Button>
      </div>
    </div>
  );
}
