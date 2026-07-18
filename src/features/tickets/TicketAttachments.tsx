import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

import type { TicketAttachment } from "@/lib/api";
import { normalizeFileUrl } from "@/lib/file-url";

type Props = {
  items: TicketAttachment[];
};

export function TicketAttachments({ items }: Props) {
  if (!items.length) return null;

  const images = items.filter((a) => (a.mimeType || "").startsWith("image/"));
  const files = items.filter((a) => !(a.mimeType || "").startsWith("image/"));

  const openLightbox = (index: number) => {
    const slides = images.map((att) => ({
      src: normalizeFileUrl(att.url),
      caption: att.name
    }));
    Fancybox.show(slides as any, { startIndex: index } as any);
  };

  return (
    <div className="mt-2 space-y-2">
      {!!images.length && (
        <div className="flex flex-wrap gap-2">
          {images.map((att, index) => {
            const url = normalizeFileUrl(att.url);
            return (
              <button
                key={att.id}
                type="button"
                className="block overflow-hidden rounded-md border bg-muted/30"
                onClick={() => openLightbox(index)}
              >
                <img
                  src={url}
                  alt={att.name}
                  className="max-h-48 max-w-[240px] cursor-zoom-in object-contain"
                />
              </button>
            );
          })}
        </div>
      )}
      {!!files.length && (
        <div className="space-y-1">
          {files.map((att) => {
            const url = normalizeFileUrl(att.url);
            return (
              <a
                key={att.id}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-primary hover:underline"
              >
                {att.name} ({Math.max(1, Math.round(att.size / 1024))} KB)
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
