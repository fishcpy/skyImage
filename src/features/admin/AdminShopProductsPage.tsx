import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { SplashScreen } from "@/components/SplashScreen";
import { deleteAdminShopProduct, fetchAdminShopProducts, formatPriceCents } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminShopProductsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "shop-products"],
    queryFn: fetchAdminShopProducts
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminShopProduct,
    onSuccess: () => {
      toast.success(t("admin.shop.deleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "shop-products"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || t("admin.shop.deleteFailed"))
  });

  if (isLoading) return <SplashScreen />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.shop.productsTitle")}</h1>
          <p className="text-muted-foreground">{t("admin.shop.productsDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/dashboard/admin/shop/orders">{t("admin.shop.orders")}</Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard/admin/shop/products/new">{t("admin.shop.newProduct")}</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.shop.productList")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data?.length ? (
            <p className="text-sm text-muted-foreground">{t("admin.shop.productsEmpty")}</p>
          ) : (
            data.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.name}</span>
                    <Badge variant={item.enabled ? "secondary" : "outline"}>
                      {item.enabled ? t("admin.shop.enabled") : t("admin.shop.disabled")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatPriceCents(item.priceCents, item.currency)} ·{" "}
                    {t("shop.days", { count: item.durationDays })} ·{" "}
                    {t("shop.group")}: {item.group?.name ?? `#${item.groupId}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/dashboard/admin/shop/products/${item.id}`}>
                      {t("common.edit") || "Edit"}
                    </Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        {t("common.delete") || "Delete"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.shop.confirmDelete")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("admin.shop.confirmDeleteDesc")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(item.id)}>
                          {t("common.delete") || "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
