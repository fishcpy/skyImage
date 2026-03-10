import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  fetchLegalDefaults,
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

const siteFields: (keyof SystemSettingsInput)[] = [
  "siteTitle",
  "consoleUrl",
  "siteDescription",
  "siteSlogan",
  "siteLogo",
  "homeBadgeText",
  "homeIntroText",
  "homePrimaryCtaText",
  "homeDashboardCtaText",
  "homeSecondaryCtaText",
  "homeFeature1Title",
  "homeFeature1Desc",
  "homeFeature2Title",
  "homeFeature2Desc",
  "homeFeature3Title",
  "homeFeature3Desc",
  "about",
  "aboutTitle",
  "notFoundMode",
  "notFoundHeading",
  "notFoundText",
  "notFoundHtml",
  "termsOfService",
  "privacyPolicy",
  "enableGallery",
  "enableHome",
  "enableApi",
  "allowRegistration",
  "accountDisabledNotice"
];

export function AdminSiteSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SystemSettingsResponse>({
    queryKey: ["admin", "system-settings"],
    queryFn: fetchSystemSettings
  });
  const [form, setForm] = useState<SystemSettingsInput>(defaultSystemSettingsForm);
  const [initialForm, setInitialForm] = useState<SystemSettingsInput | null>(null);

  const isFormDirty = useMemo(() => {
    if (!initialForm) {
      return false;
    }
    return siteFields.some((key) => initialForm[key] !== form[key]);
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
      queryClient.invalidateQueries({ queryKey: ["site-config"] });
      queryClient.invalidateQueries({ queryKey: ["site-meta"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "system-settings"] });
      toast.success("站点信息已更新");
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  if (isLoading) {
    return <SplashScreen message="加载站点信息..." />;
  }

  if (error && !data) {
    const message =
      error.message === "account disabled"
        ? "当前账户已被封禁，无法访问站点信息设置。"
        : error.message;
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>无法加载站点信息</CardTitle>
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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">系统设置</h1>
        <p className="text-muted-foreground">管理站点品牌文案与公共入口配置。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>站点信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>站点标题</Label>
            <Input value={form.siteTitle} onChange={(e) => handleChange("siteTitle", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>描述</Label>
            <Input
              value={form.siteDescription}
              onChange={(e) => handleChange("siteDescription", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>控制台地址</Label>
            <Input
              value={form.consoleUrl}
              onChange={(e) => handleChange("consoleUrl", e.target.value)}
              placeholder="http://localhost:8080"
            />
            <p className="text-xs text-muted-foreground">
              用于重置密码邮件中的链接地址。
            </p>
          </div>
          <div className="space-y-2">
            <Label>首页标语</Label>
            <Input
              value={form.siteSlogan}
              onChange={(e) => handleChange("siteSlogan", e.target.value)}
              placeholder="简单、稳定、可扩展的图像托管平台"
            />
          </div>
          <div className="space-y-2">
            <Label>网站 Logo (Favicon)</Label>
            <Input
              value={form.siteLogo}
              onChange={(e) => handleChange("siteLogo", e.target.value)}
              placeholder="输入图片链接或上传后的相对路径"
            />
            <p className="text-xs text-muted-foreground">
              可以输入外部链接（如 https://example.com/logo.ico）或上传图片后使用相对路径（如 uploads/logo.png）。将在 /favicon.ico 显示
            </p>
          </div>
          <div className="space-y-2">
            <Label>首页徽标文案</Label>
            <Input
              value={form.homeBadgeText}
              onChange={(e) => handleChange("homeBadgeText", e.target.value)}
              placeholder="新首页"
            />
          </div>
          <div className="space-y-2">
            <Label>首页介绍文案</Label>
            <Textarea
              value={form.homeIntroText}
              onChange={(e) => handleChange("homeIntroText", e.target.value)}
              rows={3}
              placeholder="面向团队和个人的现代化图像托管面板..."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>按钮文案（未登录）</Label>
              <Input
                value={form.homePrimaryCtaText}
                onChange={(e) => handleChange("homePrimaryCtaText", e.target.value)}
                placeholder="登录系统"
              />
            </div>
            <div className="space-y-2">
              <Label>按钮文案（已登录）</Label>
              <Input
                value={form.homeDashboardCtaText}
                onChange={(e) => handleChange("homeDashboardCtaText", e.target.value)}
                placeholder="进入控制台"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>次按钮文案（注册）</Label>
            <Input
              value={form.homeSecondaryCtaText}
              onChange={(e) => handleChange("homeSecondaryCtaText", e.target.value)}
              placeholder="注册账号"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>功能卡片 1 标题</Label>
              <Input
                value={form.homeFeature1Title}
                onChange={(e) => handleChange("homeFeature1Title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>功能卡片 1 描述</Label>
              <Input
                value={form.homeFeature1Desc}
                onChange={(e) => handleChange("homeFeature1Desc", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>功能卡片 2 标题</Label>
              <Input
                value={form.homeFeature2Title}
                onChange={(e) => handleChange("homeFeature2Title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>功能卡片 2 描述</Label>
              <Input
                value={form.homeFeature2Desc}
                onChange={(e) => handleChange("homeFeature2Desc", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>功能卡片 3 标题</Label>
              <Input
                value={form.homeFeature3Title}
                onChange={(e) => handleChange("homeFeature3Title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>功能卡片 3 描述</Label>
              <Input
                value={form.homeFeature3Desc}
                onChange={(e) => handleChange("homeFeature3Desc", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>关于页标题</Label>
            <Input
              value={form.aboutTitle}
              onChange={(e) => handleChange("aboutTitle", e.target.value)}
              placeholder="项目简介"
            />
            <p className="text-xs text-muted-foreground">
              关于页面中卡片的标题，留空则显示"项目简介"
            </p>
          </div>
          <div className="space-y-2">
            <Label>关于页内容</Label>
            <Textarea
              rows={4}
              value={form.about}
              onChange={(e) => handleChange("about", e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>服务条款（HTML）</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    const defaults = await fetchLegalDefaults();
                    handleChange("termsOfService", defaults.termsOfService);
                    toast.success("已重置为默认服务条款");
                  } catch (error) {
                    toast.error("获取默认内容失败");
                  }
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                重置为默认
              </Button>
            </div>
            <Textarea
              rows={6}
              value={form.termsOfService}
              onChange={(e) => handleChange("termsOfService", e.target.value)}
              placeholder="系统初始化时的默认服务条款"
            />
            <p className="text-xs text-muted-foreground">
              支持 HTML 格式，可使用 Tailwind CSS 类名
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>隐私政策（HTML）</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    const defaults = await fetchLegalDefaults();
                    handleChange("privacyPolicy", defaults.privacyPolicy);
                    toast.success("已重置为默认隐私政策");
                  } catch (error) {
                    toast.error("获取默认内容失败");
                  }
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                重置为默认
              </Button>
            </div>
            <Textarea
              rows={6}
              value={form.privacyPolicy}
              onChange={(e) => handleChange("privacyPolicy", e.target.value)}
              placeholder="系统初始化时的默认隐私政策"
            />
            <p className="text-xs text-muted-foreground">
              支持 HTML 格式，可使用 Tailwind CSS 类名
            </p>
          </div>
          
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-2">
              <Label>404 页面模式</Label>
              <Select
                value={form.notFoundMode}
                onValueChange={(value) => handleChange("notFoundMode", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择模式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">默认模板</SelectItem>
                  <SelectItem value="html">自定义 HTML</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                选择使用默认模板或完全自定义 HTML
              </p>
            </div>

            {form.notFoundMode === "template" ? (
              <>
                <div className="space-y-2">
                  <Label>404 大标题</Label>
                  <Input
                    value={form.notFoundHeading}
                    onChange={(e) => handleChange("notFoundHeading", e.target.value)}
                    placeholder="404"
                  />
                  <p className="text-xs text-muted-foreground">
                    页面中间显示的大号404文字，留空则显示"404"
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>404 页面文本</Label>
                  <Textarea
                    rows={3}
                    value={form.notFoundText}
                    onChange={(e) => handleChange("notFoundText", e.target.value)}
                    placeholder="留空则显示默认文本"
                  />
                  <p className="text-xs text-muted-foreground">
                    自定义404页面显示的文本内容，支持换行。页面标题将使用站点标题
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>404 页面自定义 HTML</Label>
                <Textarea
                  rows={8}
                  value={form.notFoundHtml}
                  onChange={(e) => handleChange("notFoundHtml", e.target.value)}
                  placeholder='<div class="text-center"><h1 class="text-6xl font-bold text-primary">404</h1><p class="mt-4">页面未找到</p></div>'
                />
                <p className="text-xs text-muted-foreground">
                  使用自定义 HTML 完全控制404页面样式。支持 Tailwind CSS 类名
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableGallery"
                checked={form.enableGallery}
                onCheckedChange={(checked) => handleChange("enableGallery", checked)}
              />
              <Label htmlFor="enableGallery">开启画廊</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableHome"
                checked={form.enableHome}
                onCheckedChange={(checked) => handleChange("enableHome", checked)}
              />
              <Label htmlFor="enableHome">开启首页</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="enableApi"
                checked={form.enableApi}
                onCheckedChange={(checked) => handleChange("enableApi", checked)}
              />
              <Label htmlFor="enableApi">开启 API</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allowRegistration"
                checked={form.allowRegistration}
                onCheckedChange={(checked) => handleChange("allowRegistration", checked)}
              />
              <Label htmlFor="allowRegistration">允许用户注册</Label>
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
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isFormDirty ? "有未保存的更改" : "未检测到配置更改"}
        </p>
        <Button onClick={() => mutation.mutate(form)} disabled={mutation.isPending || !isFormDirty}>
          {mutation.isPending ? "保存中..." : "保存站点信息"}
        </Button>
      </div>
    </div>
  );
}
