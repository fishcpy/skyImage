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

export function AdminSystemSettingsPage() {
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
      toast.success("设置已更新");
    },
    onError: (error) => toast.error(error.message)
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
    setForm((prev) => ({ ...prev, [field]: actualValue }));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="text-muted-foreground">管理图片加载相关配置。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>图片列表加载</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>单次加载行数</Label>
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
            图片列表每次滚动触发时追加的行数（首屏自动填充不计入该值）。
          </p>
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
