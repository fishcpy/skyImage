import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SplashScreen } from "@/components/SplashScreen";
import { fetchAdminTickets, type TicketPriority, type TicketStatus } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminTicketsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tickets", status],
    queryFn: () =>
      fetchAdminTickets({
        status: status === "all" ? undefined : status,
        limit: 100
      })
  });

  if (isLoading) return <SplashScreen message={t("tickets.loading")} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("tickets.adminTitle")}</h1>
        <p className="text-muted-foreground">{t("tickets.adminDescription")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "open", "pending", "resolved", "closed"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? t("tickets.filterAll") : t(`tickets.status.${s}`)}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("tickets.list")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!data?.length ? (
            <p className="text-sm text-muted-foreground">{t("tickets.empty")}</p>
          ) : (
            data.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/dashboard/admin/tickets/${ticket.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {ticket.subject}
                  </Link>
                  <div className="flex gap-2">
                    <Badge variant="secondary">
                      {t(`tickets.status.${ticket.status as TicketStatus}`)}
                    </Badge>
                    <Badge variant="outline">
                      {t(`tickets.priority.${ticket.priority as TicketPriority}`)}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                  <p>{ticket.ticketNo}</p>
                  <p>{ticket.user?.name || ticket.user?.email || `user#${ticket.userId}`}</p>
                  <p>{new Date(ticket.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
