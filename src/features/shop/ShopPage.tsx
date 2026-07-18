import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { SplashScreen } from "@/components/SplashScreen";
import {
  createShopOrder,
  fetchMembership,
  fetchShopProducts,
  fetchShopProviders,
  formatPriceCents
} from "@/lib/api";
import { useI18n } from "@/i18n";

const PROVIDER_LABELS: Record<string, string> = {
  epay: "Epay",
  alipay: "Alipay",
  wechat: "WeChat",
  stripe: "Stripe"
};

export function ShopPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const preselect = params.get("product");

  const { data: products, isLoading } = useQuery({
    queryKey: ["shop", "products"],
    queryFn: fetchShopProducts
  });
  const { data: providers } = useQuery({
    queryKey: ["shop", "providers"],
    queryFn: fetchShopProviders
  });
  const { data: membership } = useQuery({
    queryKey: ["shop", "membership"],
    queryFn: fetchMembership
  });

  const [productId, setProductId] = useState<string>(preselect || "");
  const [provider, setProvider] = useState<string>("");
  const [epayType, setEpayType] = useState("alipay");
  const [qr, setQr] = useState<string>("");

  const selected = useMemo(
    () => products?.find((p) => String(p.id) === productId),
    [products, productId]
  );

  const buyMutation = useMutation({
    mutationFn: async () => {
      if (!productId || !provider) throw new Error(t("shop.selectRequired"));
      return createShopOrder({
        productId: Number(productId),
        provider,
        epayType: provider === "epay" ? epayType : undefined,
        returnUrl: `${window.location.origin}/dashboard/orders`
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["shop", "orders"] });
      toast.success(t("shop.orderCreated"));
      if (data.payUrl) {
        window.location.href = data.payUrl;
        return;
      }
      if (data.qrContent) {
        setQr(data.qrContent);
        toast.message(t("shop.scanQr"));
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || t("shop.buyFailed"));
    }
  });

  if (isLoading) return <SplashScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("shop.title")}</h1>
          <p className="text-muted-foreground">{t("shop.consoleHint")}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard/orders">{t("shop.myOrders")}</Link>
        </Button>
      </div>

      {membership?.active && (
        <Card>
          <CardContent className="py-4 text-sm">
            {t("shop.membershipActive", {
              group: membership.groupName || "-",
              time: membership.expiresAt
                ? new Date(membership.expiresAt).toLocaleString()
                : "-"
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {!products?.length ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                {t("shop.empty")}
              </CardContent>
            </Card>
          ) : (
            products.map((p) => (
              <Card
                key={p.id}
                className={
                  String(p.id) === productId ? "border-primary ring-1 ring-primary/30" : "cursor-pointer"
                }
                onClick={() => setProductId(String(p.id))}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <Badge>{formatPriceCents(p.priceCents, p.currency)}</Badge>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  <p>{p.description || t("shop.noDescription")}</p>
                  <p>
                    {t("shop.duration")}: {t("shop.days", { count: p.durationDays })} ·{" "}
                    {t("shop.group")}: {p.group?.name ?? `#${p.groupId}`}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">{t("shop.checkout")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("shop.product")}</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("shop.selectProduct")} />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("shop.provider")}</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger>
                  <SelectValue placeholder={t("shop.selectProvider")} />
                </SelectTrigger>
                <SelectContent>
                  {(providers || []).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROVIDER_LABELS[p] || p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!providers?.length && (
                <p className="text-xs text-muted-foreground">{t("shop.noProviders")}</p>
              )}
            </div>
            {provider === "epay" && (
              <div className="space-y-2">
                <Label>{t("shop.epayType")}</Label>
                <Select value={epayType} onValueChange={setEpayType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alipay">Alipay</SelectItem>
                    <SelectItem value="wxpay">WeChat</SelectItem>
                    <SelectItem value="qqpay">QQ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {selected && (
              <p className="text-sm">
                {t("shop.payAmount")}:{" "}
                <span className="font-semibold">
                  {formatPriceCents(selected.priceCents, selected.currency)}
                </span>
              </p>
            )}
            <Button
              className="w-full"
              disabled={!productId || !provider || buyMutation.isPending}
              onClick={() => buyMutation.mutate()}
            >
              {buyMutation.isPending ? t("common.submitting") : t("shop.buy")}
            </Button>
            {qr && (
              <div className="rounded-md border p-3 text-xs break-all">
                <p className="mb-1 font-medium">{t("shop.scanQr")}</p>
                <p>{qr}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
