import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SplashScreen } from "@/components/SplashScreen";
import {
  fetchPaymentSettings,
  updatePaymentSettings,
  type PaymentSettings
} from "@/lib/api";
import { useI18n } from "@/i18n";

const empty: PaymentSettings = {
  enabled: false,
  epay: { enabled: false, apiUrl: "", pid: "", key: "", defaultType: "alipay" },
  alipay: { enabled: false, appId: "", privateKey: "", alipayPublicKey: "", gateway: "" },
  wechat: { enabled: false, appId: "", mchId: "", apiKey: "" },
  stripe: { enabled: false, secretKey: "", webhookSecret: "" }
};

export function AdminPaymentSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "payment-settings"],
    queryFn: fetchPaymentSettings
  });
  const [form, setForm] = useState<PaymentSettings>(empty);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => updatePaymentSettings(form),
    onSuccess: () => {
      toast.success(t("admin.payment.saved"));
      queryClient.invalidateQueries({ queryKey: ["admin", "payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["shop", "providers"] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || t("admin.payment.saveFailed"))
  });

  if (isLoading) return <SplashScreen />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.payment.title")}</h1>
        <p className="text-muted-foreground">{t("admin.payment.description")}</p>
      </div>

      <Card>
        <CardContent className="flex items-center space-x-2 py-4">
          <Checkbox
            id="pay-enabled"
            checked={form.enabled}
            onCheckedChange={(c) => setForm((f) => ({ ...f, enabled: c === true }))}
          />
          <Label htmlFor="pay-enabled">{t("admin.payment.enabled")}</Label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Epay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={form.epay.enabled}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, epay: { ...f.epay, enabled: c === true } }))
              }
            />
            <Label>{t("admin.payment.providerEnabled")}</Label>
          </div>
          <div className="space-y-2">
            <Label>API URL</Label>
            <Input
              value={form.epay.apiUrl}
              onChange={(e) => setForm((f) => ({ ...f, epay: { ...f.epay, apiUrl: e.target.value } }))}
              placeholder="https://pay.example.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>PID</Label>
              <Input
                value={form.epay.pid}
                onChange={(e) => setForm((f) => ({ ...f, epay: { ...f.epay, pid: e.target.value } }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Key</Label>
              <Input
                value={form.epay.key}
                onChange={(e) => setForm((f) => ({ ...f, epay: { ...f.epay, key: e.target.value } }))}
                placeholder="***"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.payment.defaultType")}</Label>
            <Input
              value={form.epay.defaultType}
              onChange={(e) =>
                setForm((f) => ({ ...f, epay: { ...f.epay, defaultType: e.target.value } }))
              }
              placeholder="alipay / wxpay"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alipay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={form.alipay.enabled}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, alipay: { ...f.alipay, enabled: c === true } }))
              }
            />
            <Label>{t("admin.payment.providerEnabled")}</Label>
          </div>
          <div className="space-y-2">
            <Label>App ID</Label>
            <Input
              value={form.alipay.appId}
              onChange={(e) =>
                setForm((f) => ({ ...f, alipay: { ...f.alipay, appId: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Private Key</Label>
            <Input
              value={form.alipay.privateKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, alipay: { ...f.alipay, privateKey: e.target.value } }))
              }
              placeholder="***"
            />
          </div>
          <div className="space-y-2">
            <Label>Alipay Public Key</Label>
            <Input
              value={form.alipay.alipayPublicKey}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  alipay: { ...f.alipay, alipayPublicKey: e.target.value }
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Gateway</Label>
            <Input
              value={form.alipay.gateway}
              onChange={(e) =>
                setForm((f) => ({ ...f, alipay: { ...f.alipay, gateway: e.target.value } }))
              }
              placeholder="https://openapi.alipay.com/gateway.do"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WeChat Pay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={form.wechat.enabled}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, wechat: { ...f.wechat, enabled: c === true } }))
              }
            />
            <Label>{t("admin.payment.providerEnabled")}</Label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>App ID</Label>
              <Input
                value={form.wechat.appId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wechat: { ...f.wechat, appId: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Mch ID</Label>
              <Input
                value={form.wechat.mchId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wechat: { ...f.wechat, mchId: e.target.value } }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              value={form.wechat.apiKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, wechat: { ...f.wechat, apiKey: e.target.value } }))
              }
              placeholder="***"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stripe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={form.stripe.enabled}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, stripe: { ...f.stripe, enabled: c === true } }))
              }
            />
            <Label>{t("admin.payment.providerEnabled")}</Label>
          </div>
          <div className="space-y-2">
            <Label>Secret Key</Label>
            <Input
              value={form.stripe.secretKey}
              onChange={(e) =>
                setForm((f) => ({ ...f, stripe: { ...f.stripe, secretKey: e.target.value } }))
              }
              placeholder="***"
            />
          </div>
          <div className="space-y-2">
            <Label>Webhook Secret</Label>
            <Input
              value={form.stripe.webhookSecret}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  stripe: { ...f.stripe, webhookSecret: e.target.value }
                }))
              }
              placeholder="***"
            />
          </div>
        </CardContent>
      </Card>

      <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        {saveMutation.isPending ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
