import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SplashScreen } from "@/components/SplashScreen";
import { MarkdownContent } from "@/components/MarkdownContent";
import { UnifiedCaptcha, type UnifiedCaptchaRef } from "@/components/UnifiedCaptcha";
import { TicketAttachments } from "@/features/tickets/TicketAttachments";
import {
  closeMyTicket,
  fetchCaptchaConfig,
  fetchMyTicket,
  fetchTicketAttachmentStrategy,
  replyMyTicket,
  uploadMyTicketAttachment,
  type TicketPriority,
  type TicketStatus
} from "@/lib/api";
import { useI18n } from "@/i18n";

export function TicketDetailPage() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const captchaRef = useRef<UnifiedCaptchaRef>(null);
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaData, setCaptchaData] = useState<Record<string, string> | undefined>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tickets", "mine", ticketId],
    queryFn: () => fetchMyTicket(ticketId),
    enabled: Number.isFinite(ticketId) && ticketId > 0
  });

  const { data: attachmentCfg } = useQuery({
    queryKey: ["tickets", "attachment-strategy"],
    queryFn: fetchTicketAttachmentStrategy
  });
  const { data: captchaConfig } = useQuery({
    queryKey: ["captcha-config", "ticket"],
    queryFn: () => fetchCaptchaConfig("ticket")
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (captchaConfig?.enabled && !captchaToken) {
        throw new Error(t("tickets.captchaRequired"));
      }
      const msg = await replyMyTicket(ticketId, body, {
        captchaToken: captchaToken || undefined,
        captchaData,
        captchaProvider: captchaConfig?.provider || undefined
      });
      if (attachmentCfg?.enabled && pendingFiles.length) {
        for (const file of pendingFiles) {
          await uploadMyTicketAttachment(ticketId, file, msg.id);
        }
      }
      return msg;
    },
    onSuccess: () => {
      toast.success(t("tickets.replySuccess"));
      setBody("");
      setPreview(false);
      setPendingFiles([]);
      setCaptchaToken("");
      setCaptchaData(undefined);
      captchaRef.current?.reset();
      queryClient.invalidateQueries({ queryKey: ["tickets", "mine", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => {
      toast.error(err.message);
      setCaptchaToken("");
      setCaptchaData(undefined);
      captchaRef.current?.reset();
    }
  });

  const closeMutation = useMutation({
    mutationFn: () => closeMyTicket(ticketId),
    onSuccess: () => {
      toast.success(t("tickets.closeSuccess"));
      queryClient.invalidateQueries({ queryKey: ["tickets", "mine", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (err) => toast.error(err.message)
  });

  if (isLoading) return <SplashScreen message={t("tickets.loading")} />;
  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link to="/dashboard/tickets">{t("tickets.back")}</Link>
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              {error?.message || t("tickets.notFound")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ticket = data.ticket;
  const closed = ticket.status === "closed";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard/tickets">{t("tickets.back")}</Link>
          </Button>
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">{ticket.ticketNo}</p>
          <div className="flex flex-wrap gap-2">
            <Badge>{t(`tickets.status.${ticket.status as TicketStatus}`)}</Badge>
            <Badge variant="outline">
              {t(`tickets.priority.${ticket.priority as TicketPriority}`)}
            </Badge>
          </div>
        </div>
        {!closed && (
          <Button
            variant="outline"
            disabled={closeMutation.isPending}
            onClick={() => closeMutation.mutate()}
          >
            {t("tickets.close")}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {data.messages.map((msg) => (
          <Card key={msg.id} className={msg.isStaff ? "border-primary/40" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {msg.user?.name || (msg.isStaff ? t("tickets.staff") : t("tickets.you"))}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleString()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <MarkdownContent content={msg.body} />
              <TicketAttachments items={msg.attachments || []} />
            </CardContent>
          </Card>
        ))}
      </div>

      {!!data.attachments?.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("tickets.attachments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketAttachments items={data.attachments} />
          </CardContent>
        </Card>
      )}

      {!closed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("tickets.reply")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
                {preview ? t("tickets.edit") : t("tickets.preview")}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-[100px] rounded-md border p-3">
                <MarkdownContent content={body} />
                {!!pendingFiles.length && (
                  <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
                    {pendingFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`}>{file.name}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Textarea
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("tickets.bodyPlaceholder")}
              />
            )}
            {attachmentCfg?.enabled ? (
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.txt,.md,.log,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPendingFiles((prev) => [...prev, file].slice(0, 5));
                    }
                    e.target.value = "";
                  }}
                />
                {!!pendingFiles.length && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {pendingFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          {t("common.delete")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("tickets.attachmentDisabled")}</p>
            )}
            {captchaConfig?.enabled && captchaConfig.siteKey && captchaConfig.provider && (
              <UnifiedCaptcha
                ref={captchaRef}
                provider={captchaConfig.provider as "cloudflare" | "geetest" | "cap"}
                siteKey={captchaConfig.siteKey}
                apiEndpoint={captchaConfig.apiEndpoint}
                onVerify={(token, extra) => {
                  setCaptchaToken(token);
                  setCaptchaData(extra);
                }}
                onError={() => {
                  setCaptchaToken("");
                  setCaptchaData(undefined);
                }}
                onExpire={() => {
                  setCaptchaToken("");
                  setCaptchaData(undefined);
                }}
              />
            )}
            <Button
              disabled={
                replyMutation.isPending ||
                !body.trim() ||
                Boolean(captchaConfig?.enabled && !captchaToken)
              }
              onClick={() => replyMutation.mutate()}
            >
              {replyMutation.isPending ? t("common.saving") : t("tickets.submitReply")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
