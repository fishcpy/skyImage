import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  fetchAccountProfile,
  fetchCaptchaConfig,
  updateAccountProfile,
  deleteAccount,
  redeemCode,
  fetchOAuthBindings,
  fetchOAuthProviders,
  startOAuthBind,
  unbindOAuth
} from "@/lib/api";
import { UnifiedCaptcha, type UnifiedCaptchaRef } from "@/components/UnifiedCaptcha";
import { SplashScreen } from "@/components/SplashScreen";
import { useI18n } from "@/i18n";

export function ProfileSettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const clearAuth = useAuthStore((state) => state.clear);
  const captchaRef = useRef<UnifiedCaptchaRef>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["account", "profile"],
    queryFn: fetchAccountProfile
  });
  const { data: captchaConfig } = useQuery({
    queryKey: ["captcha-config", "redeem"],
    queryFn: () => fetchCaptchaConfig("redeem")
  });
  const { data: oauthBindings } = useQuery({
    queryKey: ["account", "oauth-bindings"],
    queryFn: fetchOAuthBindings
  });
  const { data: oauthProviders } = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: fetchOAuthProviders,
    staleTime: 0,
    refetchOnMount: "always"
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_bound")) {
      toast.success(t("oauth.bindSuccess"));
      queryClient.invalidateQueries({ queryKey: ["account", "oauth-bindings"] });
      params.delete("oauth_bound");
      const next = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (next ? `?${next}` : ""));
    }
    const oauthError = params.get("oauth_error");
    if (oauthError) {
      toast.error(t("oauth.error", { message: oauthError }));
      params.delete("oauth_error");
      const next = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (next ? `?${next}` : ""));
    }
  }, [t, queryClient]);

  const profile = data?.user;
  const globalLoginNotify = data?.globalLoginNotificationEnabled ?? false;
  const isSuperAdmin = profile?.isSuperAdmin || false;
  const [countdown, setCountdown] = useState(5);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [redeemInput, setRedeemInput] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaData, setCaptchaData] = useState<Record<string, string> | undefined>();
  const [form, setForm] = useState({
    name: "",
    email: "",
    url: "",
    password: "",
    defaultVisibility: "private" as "public" | "private",
    theme: "system" as "light" | "dark" | "system",
    loginNotification: false,
    publicProfile: false
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? "",
        email: profile.email ?? "",
        url: profile.url ?? "",
        password: "",
        defaultVisibility: extractDefaultVisibility(profile),
        theme: extractThemePreference(profile),
        loginNotification: extractLoginNotification(profile),
        publicProfile: extractPublicProfile(profile)
      });
    }
  }, [profile]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isDialogOpen && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [isDialogOpen, countdown]);

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (open) {
      setCountdown(5);
    }
  };

  const mutation = useMutation({
    mutationFn: updateAccountProfile,
    onSuccess: (updated) => {
      setUser(updated);
      toast.success(t("profile.saved"));
      setForm((prev) => ({ ...prev, password: "" }));
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      clearAuth();
      toast.success(t("profile.deleted"));
      navigate("/login");
    },
    onError: (error) => toast.error(error.message)
  });

  const unbindMutation = useMutation({
    mutationFn: unbindOAuth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account", "oauth-bindings"] });
      toast.success(t("oauth.unbindSuccess"));
    },
    onError: (error) => toast.error(error.message)
  });

  const bindMutation = useMutation({
    mutationFn: startOAuthBind,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(error.message)
  });

  const redeemMutation = useMutation({
    mutationFn: redeemCode,
    onSuccess: (result) => {
      setUser(result.user);
      setRedeemInput("");
      setCaptchaToken("");
      setCaptchaData(undefined);
      captchaRef.current?.reset();
      if (result.message) {
        toast.success(result.message);
        return;
      }
      if (result.code?.rewardType === "capacity") {
        toast.success(t("profile.redeem.successCapacity"));
        return;
      }
      toast.success(
        t("profile.redeem.success", {
          group: result.group?.name ?? ""
        })
      );
    },
    onError: (error) => {
      toast.error(error.message);
      setCaptchaToken("");
      setCaptchaData(undefined);
      captchaRef.current?.reset();
    }
  });

  if (isLoading) {
    return <SplashScreen message={t("common.loading")} />;
  }

  const handleRedeem = () => {
    const code = redeemInput.trim();
    if (!code) return;
    if (captchaConfig?.enabled && !captchaToken) {
      toast.error(t("profile.redeem.captchaRequired"));
      return;
    }
    redeemMutation.mutate({
      code,
      captchaToken: captchaToken || undefined,
      captchaData,
      captchaProvider: captchaConfig?.provider || undefined
    });
  };

  const handleSubmit = () => {
    mutation.mutate({
      name: form.name,
      url: form.url,
      password: form.password,
      defaultVisibility: form.defaultVisibility,
      theme: form.theme,
      loginNotification: form.loginNotification,
      publicProfile: form.publicProfile
    });
  };

  const profileId =
    profile?.id == null ? "" : String(profile.id);
  const publicProfileUrl = profileId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/u/${profileId}`
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
        <p className="text-muted-foreground">{t("profile.description")}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.basic")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("profile.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("profile.email")}</Label>
              <Input value={form.email} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("profile.url")}</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("profile.newPassword")}</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder={t("profile.passwordPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("profile.defaultVisibility")}</Label>
            <Select
              value={form.defaultVisibility}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  defaultVisibility: value as "public" | "private"
                }))
              }
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t("upload.selectVisibility")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{t("upload.private")}</SelectItem>
                <SelectItem value="public">{t("upload.public")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("profile.defaultTheme")}</Label>
            <Select
              value={form.theme}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  theme: value as "light" | "dark" | "system"
                }))
              }
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder={t("theme.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">{t("theme.system")}</SelectItem>
                <SelectItem value="light">{t("theme.light")}</SelectItem>
                <SelectItem value="dark">{t("theme.dark")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>{t("profile.loginNotification")}</Label>
              {!globalLoginNotify && (
                <p className="text-xs text-muted-foreground">
                  {t("profile.loginNotificationDisabled")}
                </p>
              )}
            </div>
            <Switch
              checked={form.loginNotification}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, loginNotification: checked }))
              }
              disabled={!globalLoginNotify}
            />
          </div>
          <div className="flex items-center justify-between space-x-2 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label>{t("profile.publicProfile")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("profile.publicProfileHint")}
              </p>
              {form.publicProfile && publicProfileUrl ? (
                <p className="text-xs text-muted-foreground">
                  {t("profile.publicProfileLinkHint")}{" "}
                  <a
                    href={`/u/${profileId}`}
                    className="text-primary underline-offset-4 hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {publicProfileUrl}
                  </a>
                </p>
              ) : null}
            </div>
            <Switch
              checked={form.publicProfile}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, publicProfile: checked }))
              }
            />
          </div>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? t("profile.saving") : t("profile.save")}
          </Button>
        </CardContent>
      </Card>

      {(oauthProviders?.length || oauthBindings?.length) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("oauth.bindingsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("oauth.bindingsDescription")}</p>
            {(oauthProviders || []).map((provider) => {
              const bound = (oauthBindings || []).find((b) => b.provider === provider.id);
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    {bound && (
                      <p className="text-xs text-muted-foreground">
                        {bound.providerName || bound.providerEmail || t("oauth.bound")}
                      </p>
                    )}
                  </div>
                  {bound ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unbindMutation.isPending}
                      onClick={() => unbindMutation.mutate(provider.id)}
                    >
                      {t("oauth.unbind")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={bindMutation.isPending}
                      onClick={() => bindMutation.mutate(provider.id)}
                    >
                      {t("oauth.bind")}
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.redeem.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("profile.redeem.description")}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value)}
              placeholder={t("profile.redeem.placeholder")}
              className="sm:flex-1"
            />
            <Button
              onClick={handleRedeem}
              disabled={
                redeemMutation.isPending ||
                !redeemInput.trim() ||
                Boolean(captchaConfig?.enabled && !captchaToken)
              }
            >
              {redeemMutation.isPending ? t("profile.redeem.submitting") : t("profile.redeem.submit")}
            </Button>
          </div>
          {captchaConfig?.enabled && captchaConfig.siteKey && captchaConfig.provider && (
            <div className="flex justify-center sm:justify-start">
              <UnifiedCaptcha
                ref={captchaRef}
                provider={captchaConfig.provider as "cloudflare" | "geetest" | "cap"}
                siteKey={captchaConfig.siteKey}
                apiEndpoint={captchaConfig.apiEndpoint}
                onVerify={(token, extraData) => {
                  setCaptchaToken(token);
                  setCaptchaData(extraData);
                }}
                onError={() => {
                  setCaptchaToken("");
                  setCaptchaData(undefined);
                  toast.error(t("profile.redeem.captchaError"));
                }}
                onExpire={() => {
                  setCaptchaToken("");
                  setCaptchaData(undefined);
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!isSuperAdmin && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">{t("profile.danger")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("profile.deleteHint")}
              </p>
              <AlertDialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleteMutation.isPending}>
                    {t("profile.deleteAccount")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("profile.confirmDeleteTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("profile.confirmDeleteDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      disabled={countdown > 0}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {countdown > 0 ? t("profile.confirmDeleteCountdown", { count: countdown }) : t("profile.confirmDelete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function extractDefaultVisibility(user: any): "public" | "private" {
  const configs =
    user?.configs ??
    user?.Configs ??
    user?.preferences ??
    user?.preferences_json ??
    null;
  if (!configs) return "private";
  try {
    const parsed =
      typeof configs === "string" ? JSON.parse(configs) : configs;
    const raw =
      parsed?.default_visibility ?? parsed?.defaultVisibility ?? null;
    return raw === "public" ? "public" : "private";
  } catch {
    return "private";
  }
}

function extractThemePreference(user: any): "light" | "dark" | "system" {
  const configs =
    user?.configs ??
    user?.Configs ??
    user?.preferences ??
    user?.preferences_json ??
    null;
  if (!configs) return "system";
  try {
    const parsed =
      typeof configs === "string" ? JSON.parse(configs) : configs;
    const raw =
      parsed?.theme_preference ??
      parsed?.theme ??
      parsed?.themePreference;
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

function extractLoginNotification(user: any): boolean {
  const configs =
    user?.configs ??
    user?.Configs ??
    user?.preferences ??
    user?.preferences_json ??
    null;
  if (!configs) return false;
  try {
    const parsed =
      typeof configs === "string" ? JSON.parse(configs) : configs;
    return parsed?.login_notification === true;
  } catch {
    return false;
  }
}

function extractPublicProfile(user: any): boolean {
  const configs =
    user?.configs ??
    user?.Configs ??
    user?.preferences ??
    user?.preferences_json ??
    null;
  if (!configs) return false;
  try {
    const parsed =
      typeof configs === "string" ? JSON.parse(configs) : configs;
    return (
      parsed?.public_profile === true || parsed?.publicProfile === true
    );
  } catch {
    return false;
  }
}
