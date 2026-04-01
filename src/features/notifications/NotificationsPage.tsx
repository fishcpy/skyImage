import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  clearAccountNotifications,
  fetchAccountNotifications,
  markAllAccountNotificationsRead,
  updateAccountNotificationRead,
  type UserNotificationRecord
} from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { useI18n } from "@/i18n";

type NotificationFilter = "all" | "unread" | "read";

const filters: NotificationFilter[] = ["all", "unread", "read"];

export function NotificationsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<NotificationFilter>("all");

  const { data, isLoading, error } = useQuery<UserNotificationRecord[]>({
    queryKey: ["account", "notifications", status],
    queryFn: () => fetchAccountNotifications({ status, limit: 100, offset: 0 })
  });

  const markOneMutation = useMutation({
    mutationFn: (id: number) => updateAccountNotificationRead(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account", "notifications"] });
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  const markAllMutation = useMutation({
    mutationFn: markAllAccountNotificationsRead,
    onSuccess: () => {
      toast.success(t("notifications.markAllSuccess"));
      queryClient.invalidateQueries({ queryKey: ["account", "notifications"] });
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  const clearMutation = useMutation({
    mutationFn: clearAccountNotifications,
    onSuccess: () => {
      toast.success(t("notifications.clearSuccess"));
      queryClient.invalidateQueries({ queryKey: ["account", "notifications"] });
    },
    onError: (mutationError) => toast.error(mutationError.message)
  });

  const unreadCount = useMemo(
    () => (data ?? []).filter((item) => !item.readAt).length,
    [data]
  );

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }),
    [locale]
  );

  if (isLoading && !data) {
    return <SplashScreen message={t("notifications.loading")} />;
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t("notifications.title")}</h1>
          <p className="text-muted-foreground">{t("notifications.description")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("notifications.loadFailed")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{t("notifications.title")}</h1>
        <p className="text-muted-foreground">{t("notifications.description")}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <Button
                key={filter}
                type="button"
                variant={status === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setStatus(filter)}
              >
                {t(`notifications.filter.${filter}`)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending || unreadCount === 0}
            >
              {t("notifications.markAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!window.confirm(t("notifications.clearConfirm"))) {
                  return;
                }
                clearMutation.mutate();
              }}
              disabled={clearMutation.isPending || (data?.length ?? 0) === 0}
            >
              {t("notifications.clearAll")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!data?.length ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            {t("notifications.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const fileName = item.metadata?.fileOriginalName || t("notifications.unknownFile");
            return (
              <Card key={item.id} className={!item.readAt ? "border-primary/40" : undefined}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold">{item.title}</p>
                        <span
                          className={[
                            "rounded-full px-2.5 py-0.5 text-xs",
                            item.readAt
                              ? "bg-muted text-muted-foreground"
                              : "bg-primary/10 text-primary"
                          ].join(" ")}
                        >
                          {item.readAt ? t("notifications.read") : t("notifications.unread")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("notifications.fileLabel", { name: fileName })}
                      </p>
                      <p className="text-sm">{item.message}</p>
                    </div>
                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <span className="text-xs text-muted-foreground">
                        {formatter.format(new Date(item.createdAt))}
                      </span>
                      {!item.readAt ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => markOneMutation.mutate(item.id)}
                          disabled={markOneMutation.isPending}
                        >
                          {t("notifications.markRead")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
