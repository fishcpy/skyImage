import { Badge } from "@/components/ui/badge";
import type { FileAuditRecord } from "@/lib/api";
import { useI18n } from "@/i18n";

type Props = {
  audit?: FileAuditRecord;
};

export function auditStatusText(
  t: (key: string, params?: Record<string, string | number>) => string,
  audit?: FileAuditRecord
) {
  switch (audit?.status) {
    case "approved":
      return t("audit.status.approved");
    case "pending":
      return t("audit.status.pending");
    case "rejected":
      return t("audit.status.rejected");
    case "error":
      return t("audit.status.error");
    default:
      return t("audit.status.none");
  }
}

export function auditUploadToastText(
  t: (key: string, params?: Record<string, string | number>) => string,
  audit?: FileAuditRecord
) {
  switch (audit?.status) {
    case "approved":
      return t("audit.upload.approved");
    case "pending":
      return t("audit.upload.pending");
    case "rejected":
      return t("audit.upload.rejected");
    case "error":
      return t("audit.upload.error");
    default:
      return "";
  }
}

export function FileAuditBadge({ audit }: Props) {
  const { t } = useI18n();
  if (!audit || audit.status === "none") {
    return null;
  }

  const variant =
    audit.status === "approved"
      ? "secondary"
      : audit.status === "pending"
        ? "outline"
        : "destructive";

  return (
    <Badge variant={variant} className="text-[11px]">
      {auditStatusText(t, audit)}
    </Badge>
  );
}
