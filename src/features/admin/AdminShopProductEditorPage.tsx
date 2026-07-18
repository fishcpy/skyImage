import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { SplashScreen } from "@/components/SplashScreen";
import {
  createAdminShopProduct,
  fetchAdminShopProducts,
  fetchGroups,
  updateAdminShopProduct
} from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminShopProductEditorPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: groups } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });
  const { data: products, isLoading } = useQuery({
    queryKey: ["admin", "shop-products"],
    queryFn: fetchAdminShopProducts,
    enabled: !isNew
  });

  const [form, setForm] = useState({
    name: "",
    description: "",
    priceYuan: "1",
    currency: "CNY",
    durationDays: "30",
    groupId: "",
    enabled: true,
    sort: "0"
  });

  useEffect(() => {
    if (isNew || !products) return;
    const item = products.find((p) => String(p.id) === id);
    if (!item) return;
    setForm({
      name: item.name,
      description: item.description || "",
      priceYuan: (item.priceCents / 100).toFixed(2),
      currency: item.currency || "CNY",
      durationDays: String(item.durationDays),
      groupId: String(item.groupId),
      enabled: item.enabled,
      sort: String(item.sort ?? 0)
    });
  }, [isNew, products, id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const price = Math.round(parseFloat(form.priceYuan || "0") * 100);
      if (!form.name.trim()) throw new Error(t("admin.shop.nameRequired"));
      if (!form.groupId) throw new Error(t("admin.shop.groupRequired"));
      if (!(price > 0)) throw new Error(t("admin.shop.priceInvalid"));
      const days = parseInt(form.durationDays, 10);
      if (!days || days <= 0) throw new Error(t("admin.shop.daysInvalid"));
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        priceCents: price,
        currency: form.currency,
        durationDays: days,
        groupId: Number(form.groupId),
        enabled: form.enabled,
        sort: parseInt(form.sort || "0", 10) || 0
      };
      if (isNew) return createAdminShopProduct(payload);
      return updateAdminShopProduct(Number(id), payload);
    },
    onSuccess: () => {
      toast.success(t("admin.shop.saved"));
      queryClient.invalidateQueries({ queryKey: ["admin", "shop-products"] });
      navigate("/dashboard/admin/shop/products");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || t("admin.shop.saveFailed"));
    }
  });

  if (!isNew && isLoading) return <SplashScreen />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {isNew ? t("admin.shop.newProduct") : t("admin.shop.editProduct")}
        </h1>
        <Button asChild variant="outline">
          <Link to="/dashboard/admin/shop/products">{t("common.back")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.shop.productForm")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("admin.shop.name")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("admin.shop.description")}</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.shop.priceYuan")}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.priceYuan}
                onChange={(e) => setForm((f) => ({ ...f, priceYuan: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.shop.currency")}</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("admin.shop.durationDays")}</Label>
              <Input
                type="number"
                min="1"
                value={form.durationDays}
                onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("admin.shop.sort")}</Label>
              <Input
                type="number"
                value={form.sort}
                onChange={(e) => setForm((f) => ({ ...f, sort: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("shop.group")}</Label>
            <Select
              value={form.groupId}
              onValueChange={(v) => setForm((f) => ({ ...f, groupId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("admin.shop.selectGroup")} />
              </SelectTrigger>
              <SelectContent>
                {groups?.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>{t("admin.shop.enabled")}</Label>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
          <Button className="w-full" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
