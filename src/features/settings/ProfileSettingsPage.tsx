import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

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
  fetchAccountProfile,
  updateAccountProfile
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";

export function ProfileSettingsPage() {
  const setUser = useAuthStore((state) => state.setUser);
  const { data, isLoading } = useQuery({
    queryKey: ["account", "profile"],
    queryFn: fetchAccountProfile
  });
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

  const mutation = useMutation({
    mutationFn: updateAccountProfile,
    onSuccess: (updated) => {
      setUser(updated);
      toast.success("已保存");
      setForm((prev) => ({ ...prev, password: "" }));
    },
    onError: (error) => toast.error(error.message)
  });

  if (isLoading) {
    return <SplashScreen message="加载中..." />;
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
        <h1 className="text-2xl font-semibold">个人设置</h1>
        <p className="text-muted-foreground">更新昵称、邮箱与账户偏好。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>昵称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input value={form.email} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>个人链接</Label>
            <Input
              value={form.url}
              onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>新密码（可选）</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder="至少 8 位"
            />
          </div>
          <div className="space-y-2">
            <Label>默认上传可见性</Label>
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
                <SelectValue placeholder="选择可见性" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">私有</SelectItem>
                <SelectItem value="public">公开</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>默认主题</Label>
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
                <SelectValue placeholder="选择主题" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">跟随系统</SelectItem>
                <SelectItem value="light">浅色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "保存中..." : "保存"}
          </Button>
        </CardContent>
      </Card>
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
