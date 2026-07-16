import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { createRedeemCode, fetchGroups } from "@/lib/api";
import { useI18n } from "@/i18n";

type SizeUnit = "B" | "KB" | "MB" | "GB" | "TB";

const UNITS: { value: SizeUnit; label: string; bytes: number }[] = [
  { value: "B", label: "B", bytes: 1 },
  { value: "KB", label: "KB", bytes: 1024 },
  { value: "MB", label: "MB", bytes: 1024 * 1024 },
  { value: "GB", label: "GB", bytes: 1024 * 1024 * 1024 },
  { value: "TB", label: "TB", bytes: 1024 * 1024 * 1024 * 1024 }
];

function unitToBytes(value: number, unit: SizeUnit): number {
  const unitInfo = UNITS.find((u) => u.value === unit);
  if (!unitInfo) return value;
  return value * unitInfo.bytes;
}

export function AdminRedeemCodeEditorPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: groups } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });

  const [form, setForm] = useState({
    code: "",
    rewardType: "group" as "group" | "capacity",
    groupId: "",
    capacityValue: "1",
    capacityUnit: "GB" as SizeUnit,
    capacitySign: "plus" as "plus" | "minus",
    maxUses: "1",
    allowMultiRedeem: false,
    enabled: true,
    note: "",
    autoGenerate: true
  });

  const groupOptions = useMemo(() => groups ?? [], [groups]);

  const createMutation = useMutation({
    mutationFn: createRedeemCode,
    onSuccess: (item) => {
      toast.success(t("admin.redeem.created", { code: item.code }));
      queryClient.invalidateQueries({ queryKey: ["admin", "redeem-codes"] });
      navigate("/dashboard/admin/redeem-codes");
    },
    onError: (error) => toast.error(error.message)
  });

  const handleCreate = () => {
    const maxUses = Number(form.maxUses);
    if (!Number.isFinite(maxUses) || maxUses < 0) {
      toast.error(t("admin.redeem.maxUsesInvalid"));
      return;
    }

    if (form.rewardType === "group") {
      const groupId = Number(form.groupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        toast.error(t("admin.redeem.groupRequired"));
        return;
      }
      createMutation.mutate({
        code: form.autoGenerate ? undefined : form.code,
        rewardType: "group",
        groupId,
        maxUses,
        allowMultiRedeem: form.allowMultiRedeem,
        enabled: form.enabled,
        note: form.note,
        autoGenerate: form.autoGenerate
      });
      return;
    }

    const capacityValue = Number(form.capacityValue);
    if (!Number.isFinite(capacityValue) || capacityValue <= 0) {
      toast.error(t("admin.redeem.capacityRequired"));
      return;
    }
    const absBytes = unitToBytes(capacityValue, form.capacityUnit);
    const capacityDelta = form.capacitySign === "minus" ? -absBytes : absBytes;
    createMutation.mutate({
      code: form.autoGenerate ? undefined : form.code,
      rewardType: "capacity",
      capacityDelta,
      maxUses,
      allowMultiRedeem: form.allowMultiRedeem,
      enabled: form.enabled,
      note: form.note,
      autoGenerate: form.autoGenerate
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary" to="/dashboard/admin/redeem-codes">
            {t("admin.redeem.list")}
          </Link>{" "}
          / {t("admin.redeem.new")}
        </p>
        <h1 className="text-2xl font-semibold">{t("admin.redeem.create")}</h1>
        <p className="text-muted-foreground">{t("admin.redeem.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.redeem.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="autoGenerate"
              checked={form.autoGenerate}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, autoGenerate: Boolean(checked) }))
              }
            />
            <Label htmlFor="autoGenerate">{t("admin.redeem.autoGenerate")}</Label>
          </div>
          {!form.autoGenerate && (
            <div className="space-y-2">
              <Label>{t("admin.redeem.code")}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="VIP-XXXX-YYYY"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("admin.redeem.rewardType")}</Label>
            <Select
              value={form.rewardType}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  rewardType: value as "group" | "capacity"
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">{t("admin.redeem.rewardGroup")}</SelectItem>
                <SelectItem value="capacity">{t("admin.redeem.rewardCapacity")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.rewardType === "group" ? (
            <div className="space-y-2">
              <Label>{t("admin.redeem.group")}</Label>
              <Select
                value={form.groupId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, groupId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.redeem.selectGroup")} />
                </SelectTrigger>
                <SelectContent>
                  {groupOptions.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t("admin.redeem.capacityDelta")}</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={form.capacitySign}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      capacitySign: value as "plus" | "minus"
                    }))
                  }
                >
                  <SelectTrigger className="sm:w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plus">{t("admin.redeem.capacityPlus")}</SelectItem>
                    <SelectItem value="minus">{t("admin.redeem.capacityMinus")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.capacityValue}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, capacityValue: e.target.value }))
                  }
                  className="sm:flex-1"
                />
                <Select
                  value={form.capacityUnit}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, capacityUnit: value as SizeUnit }))
                  }
                >
                  <SelectTrigger className="sm:w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">{t("admin.redeem.capacityHint")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("admin.redeem.maxUses")}</Label>
            <Input
              type="number"
              min={0}
              value={form.maxUses}
              onChange={(e) => setForm((prev) => ({ ...prev, maxUses: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t("admin.redeem.maxUsesHint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.redeem.note")}</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder={t("admin.redeem.notePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:w-auto sm:min-w-[240px]">
              <Label>{t("admin.redeem.allowMulti")}</Label>
              <Switch
                checked={form.allowMultiRedeem}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, allowMultiRedeem: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:w-auto sm:min-w-[200px]">
              <Label>{t("admin.redeem.enabled")}</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? t("common.submitting") : t("admin.redeem.createAction")}
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/dashboard/admin/redeem-codes">{t("common.cancel")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
