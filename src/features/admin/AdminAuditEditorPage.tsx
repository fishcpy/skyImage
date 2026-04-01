import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    if (!isEditing || !audits) {
      return;
    }
    const current = audits.find((item) => item.id === Number(id));
    if (!current) {
      return;
    }
    setForm({
      ...current,
      configs: {
        api_key: current.configs?.api_key || "",
        max_concurrency: current.configs?.max_concurrency || 1
      }
    });
  }, [audits, id, isEditing]);

  const providerOptions = [
    {
      value: "uapis_nsfw",
      label: t("admin.auditEditor.provider.uapis"),
      endpoint: "POST https://uapis.cn/api/v1/image/nsfw",
      features: [
        t("admin.auditEditor.providerFeatureSuggestion"),
        t("admin.auditEditor.providerFeatureRisk"),
        t("admin.auditEditor.providerFeatureConfidence")
      ]
    }
  ];
  const selectedProvider =
    providerOptions.find((item) => item.value === form.provider) ?? providerOptions[0];

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
    saveMutation.mutate({
      ...form,
      provider: form.provider || "uapis_nsfw",
      configs: {
        api_key: form.configs?.api_key || "",
        max_concurrency: Number(form.configs?.max_concurrency) > 0
          ? Number(form.configs?.max_concurrency)
          : 1
      }
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
                onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value }))}
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

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{selectedProvider.label}</h3>
                  <Badge variant="secondary">{t("admin.auditEditor.providerBadge")}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("admin.auditEditor.providerSummary")}
                </p>
              </div>
              <code className="rounded-md bg-background px-3 py-2 text-xs">
                {selectedProvider.endpoint}
              </code>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {selectedProvider.features.map((feature) => (
                <div key={feature} className="rounded-lg border bg-background px-3 py-3 text-sm">
                  {feature}
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              {t("admin.auditEditor.providerHelpCompact")}
            </p>
          </div>

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
