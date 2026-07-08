import { ExternalLinkIcon, EyeIcon } from "lucide-react";

import type { UiMediaInspection } from "#/lib/chat/ui";

export function MediaInspectionCard({ data }: { data: UiMediaInspection }) {
  const isImage = data.assetType.startsWith("image/");
  const isVideo = data.assetType.startsWith("video/");
  const canPreview = isImage || isVideo;

  return (
    <div className="border-border my-2 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <EyeIcon className="text-muted-foreground/60 size-4" />
        <span className="text-xs font-medium">Media Inspection</span>
        <a
          className="text-muted-foreground/50 hover:text-foreground ml-auto transition-colors"
          href={data.assetUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>

      <p className="text-muted-foreground/80 text-[11px] leading-relaxed">{data.answer}</p>

      {canPreview && (
        <div className="border-border bg-muted/10 relative aspect-video overflow-hidden rounded border">
          {isVideo ? (
            <video
              className="size-full object-contain"
              controls
              playsInline
              preload="metadata"
              src={data.assetUrl}
            />
          ) : (
            <img
              alt={data.assetName}
              className="size-full object-contain"
              loading="lazy"
              src={data.assetUrl}
            />
          )}
        </div>
      )}
    </div>
  );
}
