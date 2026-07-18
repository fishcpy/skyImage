import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { MarkdownContent } from "@/components/MarkdownContent";
import { UnifiedCaptcha, type UnifiedCaptchaRef } from "@/components/UnifiedCaptcha";
import {
  createTicket,
  fetchCaptchaConfig,
  fetchTicketAttachmentStrategy,
  uploadMyTicketAttachment,
  type TicketPriority
} from "@/lib/api";
import { useI18n } from "@/i18n";

export function TicketCreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const captchaRef = useRef<UnifiedCaptchaRef>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [preview, setPreview] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaData, setCaptchaData] = useState<Record<string, string> | undefined>();

  const { data: attachmentCfg } = useQuery({
    queryKey: ["tickets", "attachment-strategy"],
    queryFn: fetchTicketAttachmentStrategy
  });
  const { data: captchaConfig } = useQuery({
    queryKey: ["captcha-config", "ticket"],
    queryFn: () => fetchCaptchaConfig("ticket")
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (captchaConfig?.enabled && !captchaToken) {
        throw new Error(t("tickets.captchaRequired"));
      }
      const detail = await createTicket({
        subject,
        body,
        priority,
        captchaToken: captchaToken || undefined,
        captchaData,
        captchaProvider: captchaConfig?.provider || undefined
      });
      const firstMessageId = detail.messages?.[0]?.id;
      if (attachmentCfg?.enabled && pendingFiles.length && firstMessageId) {
        for (const file of pendingFiles) {
          await uploadMyTicketAttachment(detail.ticket.id, file, firstMessageId);
        }
      }
      return detail;
    },
    onSuccess: (detail) => {
      toast.success(t("tickets.createSuccess"));
      navigate(`/dashboard/tickets/${detail.ticket.id}`);
    },
    onError: (err) => {
      toast.error(err.message);
      setCaptchaToken("");
      setCaptchaData(undefined);
      captchaRef.current?.reset();
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/tickets">{t("tickets.back")}</Link>
        </Button>
        <h1 className="text-2xl font-semibold">{t("tickets.create")}</h1>
        <p className="text-muted-foreground">{t("tickets.createDescription")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("tickets.create")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("tickets.subject")}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("tickets.priority")}</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("tickets.priority.low")}</SelectItem>
                <SelectItem value="normal">{t("tickets.priority.normal")}</SelectItem>
                <SelectItem value="high">{t("tickets.priority.high")}</SelectItem>
                <SelectItem value="urgent">{t("tickets.priority.urgent")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("tickets.body")}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
                {preview ? t("tickets.edit") : t("tickets.preview")}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-[120px] rounded-md border p-3">
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
                rows={10}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("tickets.bodyPlaceholder")}
              />
            )}
          </div>
          {attachmentCfg?.enabled ? (
            <div className="space-y-2">
              <Label>{t("tickets.attachments")}</Label>
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
          <div className="flex gap-2">
            <Button
              disabled={
                createMutation.isPending ||
                !subject.trim() ||
                !body.trim() ||
                Boolean(captchaConfig?.enabled && !captchaToken)
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? t("common.saving") : t("tickets.submit")}
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/tickets">{t("common.cancel")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
