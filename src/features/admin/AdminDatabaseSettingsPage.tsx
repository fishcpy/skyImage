import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  fetchDatabaseConfig,
  testDatabaseConnection,
  migrateDatabase,
  type DatabaseConfigView,
  type DatabaseTargetInput,
  type DatabaseMigrateResult
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { useI18n } from "@/i18n";

const defaultTarget: DatabaseTargetInput = {
  type: "mysql",
  path: "storage/data/skyimage.db",
  host: "localhost",
  port: "3306",
  name: "skyimage",
  user: "root",
  password: ""
};

function summarizeCurrent(cfg: DatabaseConfigView | undefined, t: (k: string) => string) {
  if (!cfg?.type) {
    return t("admin.database.unknown");
  }
  if (cfg.type === "sqlite") {
    return `SQLite · ${cfg.path || "-"}`;
  }
  return `${cfg.type} · ${cfg.user || "-"}@${cfg.host || "-"}:${cfg.port || "-"}/${cfg.name || "-"}`;
}

export function AdminDatabaseSettingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<DatabaseConfigView>({
    queryKey: ["admin", "database-config"],
    queryFn: fetchDatabaseConfig
  });

  const [target, setTarget] = useState<DatabaseTargetInput>(defaultTarget);
  const [truncateTarget, setTruncateTarget] = useState(true);
  const [switchRuntime, setSwitchRuntime] = useState(true);
  const [lastResult, setLastResult] = useState<DatabaseMigrateResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!data?.type) return;
    if (data.type === "sqlite") {
      setTarget((prev) => ({
        ...prev,
        type: "mysql",
        port: "3306"
      }));
    } else {
      setTarget((prev) => ({
        ...prev,
        type: "sqlite",
        path: "storage/data/skyimage.db"
      }));
    }
  }, [data?.type]);

  const portPlaceholder = useMemo(
    () => (target.type === "postgres" ? "5432" : "3306"),
    [target.type]
  );

  const testMutation = useMutation({
    mutationFn: () => testDatabaseConnection(target),
    onSuccess: () => toast.success(t("admin.database.testOk")),
    onError: (err: Error) => toast.error(err.message)
  });

  const migrateMutation = useMutation({
    mutationFn: () =>
      migrateDatabase({
        target,
        truncateTarget,
        switchRuntime
      }),
    onSuccess: (result) => {
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ["admin", "database-config"] });
      toast.success(t("admin.database.migrateOk"));
      if (result.switched) {
        toast.message(t("admin.database.switchedHint"));
      }
    },
    onError: (err: Error) => toast.error(err.message)
  });

  if (isLoading) {
    return <SplashScreen message={t("admin.database.loading")} />;
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.database.loadFailed")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const setField = <K extends keyof DatabaseTargetInput>(key: K, value: DatabaseTargetInput[K]) => {
    setTarget((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "type") {
        if (value === "postgres" && (prev.port === "3306" || !prev.port)) {
          next.port = "5432";
        }
        if (value === "mysql" && (prev.port === "5432" || !prev.port)) {
          next.port = "3306";
        }
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.database.title")}</h1>
        <p className="text-muted-foreground">{t("admin.database.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.database.current")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t("admin.database.currentValue")}: </span>
            {summarizeCurrent(data, t)}
          </p>
          <p className="text-muted-foreground">{t("admin.database.currentHint")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.database.target")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("admin.database.type")}</Label>
            <Select value={target.type} onValueChange={(v) => setField("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sqlite">SQLite</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {target.type === "sqlite" ? (
            <div className="space-y-2">
              <Label htmlFor="db-path">{t("admin.database.path")}</Label>
              <Input
                id="db-path"
                value={target.path}
                onChange={(e) => setField("path", e.target.value)}
                placeholder="storage/data/skyimage.db"
              />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="db-host">{t("admin.database.host")}</Label>
                  <Input
                    id="db-host"
                    value={target.host}
                    onChange={(e) => setField("host", e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="db-port">{t("admin.database.port")}</Label>
                  <Input
                    id="db-port"
                    value={target.port}
                    onChange={(e) => setField("port", e.target.value)}
                    placeholder={portPlaceholder}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="db-name">{t("admin.database.name")}</Label>
                  <Input
                    id="db-name"
                    value={target.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="skyimage"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="db-user">{t("admin.database.user")}</Label>
                  <Input
                    id="db-user"
                    value={target.user}
                    onChange={(e) => setField("user", e.target.value)}
                    placeholder="root"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="db-password">{t("admin.database.password")}</Label>
                <Input
                  id="db-password"
                  type="password"
                  value={target.password}
                  onChange={(e) => setField("password", e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-1">
              <Label>{t("admin.database.truncate")}</Label>
              <p className="text-xs text-muted-foreground">{t("admin.database.truncateHint")}</p>
            </div>
            <Switch checked={truncateTarget} onCheckedChange={setTruncateTarget} />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-1">
              <Label>{t("admin.database.switchRuntime")}</Label>
              <p className="text-xs text-muted-foreground">{t("admin.database.switchRuntimeHint")}</p>
            </div>
            <Switch checked={switchRuntime} onCheckedChange={setSwitchRuntime} />
          </div>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
            {t("admin.database.warning")}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={testMutation.isPending || migrateMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? t("admin.database.testing") : t("admin.database.test")}
            </Button>
            <Button
              type="button"
              disabled={testMutation.isPending || migrateMutation.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {migrateMutation.isPending ? t("admin.database.migrating") : t("admin.database.migrate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.database.result")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {lastResult.sourceType} → {lastResult.targetType}
              {lastResult.switched ? ` · ${t("admin.database.switched")}` : ""}
            </p>
            <ul className="max-h-64 space-y-1 overflow-auto font-mono text-xs">
              {lastResult.tables.map((row) => (
                <li key={row.table}>
                  {row.table}: {row.sourceRows ?? row.rows}
                  {row.targetRows !== undefined ? ` → ${row.targetRows}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.database.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("admin.database.confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={migrateMutation.isPending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={migrateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                setConfirmOpen(false);
                migrateMutation.mutate();
              }}
            >
              {migrateMutation.isPending ? t("admin.database.migrating") : t("admin.database.migrate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
