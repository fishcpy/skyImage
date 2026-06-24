import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchGeneralSettings,
  updateGeneralSettings,
  type GeneralSettings
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { useI18n } from "@/i18n";

const defaultAdminImageDeleteReasonText = "图片已被管理员删除";
const defaultSystemAutoDeleteReasonText = "图片已被系统自动删除";

const defaultGeneralSettingsForm: GeneralSettings = {
  imageLoadRows: 4,
  userNotificationLimit: 50,
  adminImageDeleteDefaultReason: defaultAdminImageDeleteReasonText,
  systemAutoDeleteDefaultReason: defaultSystemAutoDeleteReasonText,
  enableCDN: false
};

export function AdminSystemSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<GeneralSettings>({
    queryKey: ["admin", "general-settings"],
    queryFn: fetchGeneralSettings
  });
  const [form, setForm] = useState<GeneralSettings>(defaultGeneralSettingsForm);
  const [initialForm, setInitialForm] = useState<GeneralSettings | null>(null);

  // Calculate if form is dirty - must be before any conditional returns
  const isFormDirty = useMemo(() => {
    if (!initialForm) {
      return false;
    }
    const keys = Object.keys(defaultGeneralSettingsForm) as (keyof GeneralSettings)[];
    return keys.some((key) => initialForm[key] !== form[key]);
  }, [initialForm, form]);

  useEffect(() => {
    if (data) {
      const normalized = {
        ...defaultGeneralSettingsForm,
        ...data
      };
      setForm(normalized);
      setInitialForm(normalized);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (input: GeneralSettings) => updateGeneralSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["site-meta"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "general-settings"] });
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

  const handleChange = (field: keyof GeneralSettings, value: any) => {
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
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.systemSettings.notifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("admin.systemSettings.userNotificationLimit")}</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={form.userNotificationLimit}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10);
                handleChange("userNotificationLimit", Number.isNaN(value) ? 50 : value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.systemSettings.userNotificationLimitHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.systemSettings.adminDeleteReason")}</Label>
            <Textarea
              rows={3}
              value={form.adminImageDeleteDefaultReason}
              onChange={(e) =>
                handleChange("adminImageDeleteDefaultReason", e.target.value)
              }
              placeholder={t("admin.systemSettings.adminDeleteReasonPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.systemSettings.adminDeleteReasonHint")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.systemSettings.systemAutoDeleteReason")}</Label>
            <Textarea
              rows={3}
              value={form.systemAutoDeleteDefaultReason}
              onChange={(e) =>
                handleChange("systemAutoDeleteDefaultReason", e.target.value)
              }
              placeholder={t("admin.systemSettings.systemAutoDeleteReasonPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.systemSettings.systemAutoDeleteReasonHint")}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.systemSettings.network")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>{t("admin.systemSettings.enableCDN")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("admin.systemSettings.enableCDNHint")}
              </p>
            </div>
            <Switch
              checked={form.enableCDN}
              onCheckedChange={(checked) => handleChange("enableCDN", checked)}
            />
          </div>
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
