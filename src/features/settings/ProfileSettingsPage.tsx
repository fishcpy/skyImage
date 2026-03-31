import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/state/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
  updateAccountProfile,
  deleteAccount
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { useI18n } from "@/i18n";

export function ProfileSettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const clearAuth = useAuthStore((state) => state.clear);
  const { data, isLoading } = useQuery({
    queryKey: ["account", "profile"],
    queryFn: fetchAccountProfile
  });
  
  const isSuperAdmin = data?.isSuperAdmin || false;
  const [countdown, setCountdown] = useState(5);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    url: "",
    password: "",
    defaultVisibility: "private" as "public" | "private",
    theme: "system" as "light" | "dark" | "system"
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        email: data.email ?? "",
        url: data.url ?? "",
        password: "",
        defaultVisibility: extractDefaultVisibility(data),
        theme: extractThemePreference(data)
      });
    }
  }, [data]);

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

  if (isLoading) {
    return <SplashScreen message={t("common.loading")} />;
  }

  const handleSubmit = () => {
    mutation.mutate({
      name: form.name,
      url: form.url,
      password: form.password,
      defaultVisibility: form.defaultVisibility,
      theme: form.theme
    });
  };

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
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? t("profile.saving") : t("profile.save")}
          </Button>
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
