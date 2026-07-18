import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SplashScreen } from "@/components/SplashScreen";
import { fetchAdminShopOrders, formatPriceCents } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminShopOrdersPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "shop-orders"],
    queryFn: () => fetchAdminShopOrders({ limit: 100 })
  });

  if (isLoading) return <SplashScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.shop.ordersTitle")}</h1>
          <p className="text-muted-foreground">{t("admin.shop.ordersDescription")}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/dashboard/admin/shop/products">{t("admin.shop.products")}</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.shop.orderList")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data?.length ? (
            <p className="text-sm text-muted-foreground">{t("admin.shop.ordersEmpty")}</p>
          ) : (
            data.map((o) => (
              <div key={o.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.productName}</span>
                  <Badge variant="secondary">{o.status}</Badge>
                </div>
                <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                  <p>{o.orderNo}</p>
                  <p>{formatPriceCents(o.priceCents, o.currency)}</p>
                  <p>
                    {o.user?.name || o.user?.email || `user#${o.userId}`}
                  </p>
                  <p>
                    {o.provider} · {new Date(o.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
