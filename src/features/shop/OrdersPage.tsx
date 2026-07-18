import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SplashScreen } from "@/components/SplashScreen";
import { fetchMyShopOrders, formatPriceCents } from "@/lib/api";
import { useI18n } from "@/i18n";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "paid":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
    case "closed":
      return "destructive";
    default:
      return "outline";
  }
}

export function OrdersPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const highlight = params.get("order_no");

  const { data: orders, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["shop", "orders"],
    queryFn: () => fetchMyShopOrders({ limit: 100 }),
    refetchInterval: (query) => {
      const list = query.state.data;
      return list?.some((o) => o.status === "pending") ? 5000 : false;
    }
  });

  if (isLoading) return <SplashScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("shop.ordersTitle")}</h1>
          <p className="text-muted-foreground">{t("shop.ordersDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {t("shop.refresh")}
          </Button>
          <Button asChild>
            <Link to="/dashboard/shop">{t("shop.goShop")}</Link>
          </Button>
        </div>
      </div>

      {!orders?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("shop.ordersEmpty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card
              key={o.id}
              className={highlight === o.orderNo ? "border-primary ring-1 ring-primary/30" : undefined}
            >
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{o.productName}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{o.orderNo}</p>
                </div>
                <Badge variant={statusVariant(o.status)}>
                  {t(`shop.status.${o.status}` as any) || o.status}
                </Badge>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                <p>
                  {t("shop.payAmount")}: {formatPriceCents(o.priceCents, o.currency)}
                </p>
                <p>
                  {t("shop.provider")}: {o.provider}
                </p>
                <p>
                  {t("shop.duration")}: {t("shop.days", { count: o.durationDays })}
                </p>
                <p>
                  {t("shop.createdAt")}: {new Date(o.createdAt).toLocaleString()}
                </p>
                {o.membershipExpiresAt && (
                  <p className="sm:col-span-2">
                    {t("shop.memberUntil")}: {new Date(o.membershipExpiresAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
