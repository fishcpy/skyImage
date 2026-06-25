import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAuditProfiles, saveAuditProfile, type AuditProfileRecord } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminAuditEditorPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: audits } = useQuery({
    queryKey: ["admin", "audits"],
    queryFn: fetchAuditProfiles
  });
  const [form, setForm] = useState<Partial<AuditProfileRecord>>({
    name: "",
    provider: "uapis_nsfw",
    configs: {
      api_key: "",
      max_concurrency: 1
    }
  });

  const getDefaultConfigs = (provider: string) => {
    switch (provider) {
      case "tencent_ci":
        return { secret_id: "", secret_key: "", region: "ap-guangzhou", bucket: "", app_id: "", biz_type: "", max_concurrency: 1 };
      default:
        return { api_key: "", max_concurrency: 1 };
    }
  };

  useEffect(() => {
    if (!isEditing || !audits) {
      return;
    }
    const current = audits.find((item) => item.id === Number(id));
    if (!current) {
      return;
    }
    const provider = current.provider || "uapis_nsfw";
    const defaults = getDefaultConfigs(provider);
    const mergedConfigs: Record<string, unknown> = { ...defaults };
    if (current.configs) {
      for (const key of Object.keys(defaults)) {
        if (current.configs[key] !== undefined && current.configs[key] !== "") {
          mergedConfigs[key] = current.configs[key];
        }
      }
    }
    setForm({
      ...current,
      provider,
      configs: mergedConfigs
    });
  }, [audits, id, isEditing]);

  const providerOptions = [
    { value: "uapis_nsfw", label: t("admin.auditEditor.provider.uapis") },
    { value: "tencent_ci", label: t("admin.auditEditor.provider.tencent") }
  ];

  const saveMutation = useMutation({
    mutationFn: saveAuditProfile,
    onSuccess: () => {
      toast.success(t("admin.auditEditor.saved"));
      queryClient.invalidateQueries({ queryKey: ["admin", "audits"] });
      navigate("/dashboard/admin/audits");
    },
    onError: (error) => toast.error(error.message)
  });

  const handleSave = () => {
    if (!form.name) {
      return;
    }
    const provider = form.provider || "uapis_nsfw";
    let configs: Record<string, unknown>;
    if (provider === "tencent_ci") {
      configs = {
        secret_id: form.configs?.secret_id || "",
        secret_key: form.configs?.secret_key || "",
        region: form.configs?.region || "ap-guangzhou",
        bucket: form.configs?.bucket || "",
        app_id: form.configs?.app_id || "",
        biz_type: form.configs?.biz_type || "",
        max_concurrency: Number(form.configs?.max_concurrency) > 0
          ? Number(form.configs?.max_concurrency) : 1
      };
    } else {
      configs = {
        api_key: form.configs?.api_key || "",
        max_concurrency: Number(form.configs?.max_concurrency) > 0
          ? Number(form.configs?.max_concurrency) : 1
      };
    }
    saveMutation.mutate({
      ...form,
      provider,
      configs
    } as AuditProfileRecord);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary" to="/dashboard/admin/audits">
            {t("admin.audits.title")}
          </Link>{" "}
          / {isEditing ? t("admin.auditEditor.edit") : t("admin.auditEditor.new")}
        </p>
        <h1 className="text-2xl font-semibold">
          {isEditing ? form.name : t("admin.auditEditor.newTitle")}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.auditEditor.config")}</CardTitle>
          <CardDescription>{t("admin.auditEditor.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.auditEditor.name")}</Label>
              <Input
                value={form.name || ""}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.auditEditor.provider")}</Label>
              <Select
                value={form.provider || "uapis_nsfw"}
                onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value, configs: getDefaultConfigs(value) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.auditEditor.providerPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      {provider.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.provider === "tencent_ci" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.secretId")}</Label>
                  <Input
                    type="password"
                    value={(form.configs?.secret_id as string) || ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, secret_id: event.target.value }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.auditEditor.secretIdHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.secretKey")}</Label>
                  <Input
                    type="password"
                    value={(form.configs?.secret_key as string) || ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, secret_key: event.target.value }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.auditEditor.secretKeyHint")}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.region")}</Label>
                  <Input
                    value={(form.configs?.region as string) || "ap-guangzhou"}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, region: event.target.value }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.auditEditor.regionHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.bucket")}</Label>
                  <Input
                    value={(form.configs?.bucket as string) || ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, bucket: event.target.value }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.auditEditor.bucketHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.appId")}</Label>
                  <Input
                    value={(form.configs?.app_id as string) || ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, app_id: event.target.value }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.auditEditor.appIdHint")}</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.bizType")}</Label>
                  <Input
                    value={(form.configs?.biz_type as string) || ""}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, biz_type: event.target.value }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">{t("admin.auditEditor.bizTypeHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("admin.auditEditor.maxConcurrency")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={form.configs?.max_concurrency || 1}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: {
                          ...prev.configs,
                          max_concurrency: parseInt(event.target.value, 10) || 1
                        }
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("admin.auditEditor.maxConcurrencyHint")}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>{t("admin.auditEditor.apiKey")}</Label>
                <Input
                  type="password"
                  value={form.configs?.api_key || ""}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, api_key: event.target.value }
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">{t("admin.auditEditor.apiKeyHint")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.auditEditor.maxConcurrency")}</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.configs?.max_concurrency || 1}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: {
                        ...prev.configs,
                        max_concurrency: parseInt(event.target.value, 10) || 1
                      }
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("admin.auditEditor.maxConcurrencyHint")}
                </p>
              </div>
            </>
          )}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={!form.name || saveMutation.isPending}>
              {saveMutation.isPending ? t("common.saving") : t("admin.auditEditor.save")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard/admin/audits")}
              disabled={saveMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
