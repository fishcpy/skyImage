import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SplashScreen } from "@/components/SplashScreen";
import { fetchMyTickets, type TicketPriority, type TicketStatus } from "@/lib/api";
import { useI18n } from "@/i18n";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":
      return "default";
    case "pending":
      return "secondary";
    case "resolved":
      return "outline";
    case "closed":
      return "destructive";
    default:
      return "outline";
  }
}

export function TicketsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", "mine", status],
    queryFn: () =>
      fetchMyTickets({
        status: status === "all" ? undefined : status,
        limit: 100
      })
  });

  if (isLoading) return <SplashScreen message={t("tickets.loading")} />;

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t("tickets.title")}</h1>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("tickets.title")}</h1>
          <p className="text-muted-foreground">{t("tickets.description")}</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/tickets/new">{t("tickets.create")}</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "open", "pending", "resolved", "closed"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s === "all" ? t("tickets.filterAll") : t(`tickets.status.${s}` as const)}
          </Button>
        ))}
      </div>

      {!data?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("tickets.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((ticket) => (
            <Card key={ticket.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      to={`/dashboard/tickets/${ticket.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{ticket.ticketNo}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusVariant(ticket.status)}>
                    {t(`tickets.status.${ticket.status as TicketStatus}`)}
                  </Badge>
                  <Badge variant="outline">
                    {t(`tickets.priority.${ticket.priority as TicketPriority}`)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {new Date(ticket.updatedAt).toLocaleString()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
