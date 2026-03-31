import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  fetchInstallerStatus,
  runInstaller
} from "@/lib/api";
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
import { useAuthStore } from "@/state/auth";
import { useI18n } from "@/i18n";

export function InstallerPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((state) => state.clear);
  const [step, setStep] = useState(1); // 1: 数据库配置, 2: 站点信息
  
  const { data, isLoading } = useQuery({
    queryKey: ["installer"],
    queryFn: fetchInstallerStatus
  });

  const [form, setForm] = useState({
    databaseType: "sqlite",
    databasePath: "storage/data/skyimage.db",
    databaseHost: "localhost",
    databasePort: "3306",
    databaseName: "skyimage",
    databaseUser: "root",
    databasePassword: "",
    siteName: "skyImage",
    adminName: "Administrator",
    adminEmail: "",
    adminPassword: ""
  });

  const mutation = useMutation({
    mutationFn: runInstaller,
    onSuccess: () => {
      clearAuth();
      toast.success(t("installer.complete"));
      queryClient.invalidateQueries({ queryKey: ["installer"] });
      window.location.href = "/login";
    },
    onError: (error) => toast.error(error.message)
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">{t("installer.checking")}</div>;
  }

  if (data?.installed) {
    return (
      <Card className="max-w-xl mx-auto mt-20">
        <CardHeader>
          <CardTitle>{t("installer.installed")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>{t("installer.version", { version: data.version ?? "" })}</p>
          <Button onClick={() => (window.location.href = "/login")}>
            {t("installer.goLogin")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">{t("installer.title")}</h1>
        <p className="text-muted-foreground">
          {step === 1 ? t("installer.step1") : t("installer.step2")}
        </p>
      </div>
      
      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("installer.database")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="databaseType">{t("installer.databaseType")}</Label>
              <Select
                value={form.databaseType}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, databaseType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("installer.selectDatabaseType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqlite">{t("installer.sqliteRecommended")}</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.databaseType === "sqlite" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="databasePath">{t("installer.databasePath")}</Label>
                  <Input
                    id="databasePath"
                    value={form.databasePath}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databasePath: e.target.value }))
                    }
                    placeholder="storage/data/skyimage.db"
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("installer.sqliteHint")}
                  </p>
                </div>
              </>
            )}

            {form.databaseType !== "sqlite" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="databaseHost">{t("installer.databaseHost")}</Label>
                  <Input
                    id="databaseHost"
                    value={form.databaseHost}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databaseHost: e.target.value }))
                    }
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databasePort">{t("installer.port")}</Label>
                  <Input
                    id="databasePort"
                    value={form.databasePort}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databasePort: e.target.value }))
                    }
                    placeholder={form.databaseType === "postgres" ? "5432" : "3306"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databaseName">{t("installer.databaseName")}</Label>
                  <Input
                    id="databaseName"
                    value={form.databaseName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databaseName: e.target.value }))
                    }
                    placeholder="skyimage"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databaseUser">{t("installer.databaseUser")}</Label>
                  <Input
                    id="databaseUser"
                    value={form.databaseUser}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databaseUser: e.target.value }))
                    }
                    placeholder="root"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databasePassword">{t("installer.databasePassword")}</Label>
                  <Input
                    id="databasePassword"
                    type="password"
                    value={form.databasePassword}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databasePassword: e.target.value }))
                    }
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              onClick={() => setStep(2)}
            >
              {t("installer.next")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("installer.siteInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">{t("installer.siteName")}</Label>
              <Input
                id="siteName"
                value={form.siteName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, siteName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminName">{t("installer.adminName")}</Label>
              <Input
                id="adminName"
                value={form.adminName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adminName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">{t("installer.adminEmail")}</Label>
              <Input
                id="adminEmail"
                type="email"
                value={form.adminEmail}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adminEmail: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">{t("installer.adminPassword")}</Label>
              <Input
                id="adminPassword"
                type="password"
                value={form.adminPassword}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    adminPassword: e.target.value
                  }))
                }
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStep(1)}
              >
                {t("installer.previous")}
              </Button>
              <Button
                className="w-full"
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? t("installer.installing") : t("installer.installNow")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
