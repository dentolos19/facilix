import { ExternalLinkIcon, EyeIcon } from "lucide-react";

import type { UiMediaInspection } from "#/lib/chat/ui";

export function MediaInspectionCard({ data }: { data: UiMediaInspection }) {
  const isImage = data.assetType.startsWith("image/");
  const isVideo = data.assetType.startsWith("video/");
  const canPreview = isImage || isVideo;

  return (
    <div className="my-2 flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <EyeIcon className="size-4 text-muted-foreground/60" />
        <span className="text-xs font-medium">Media Inspection</span>
        <a
          className="ml-auto text-muted-foreground/50 transition-colors hover:text-foreground"
          href={data.assetUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          <ExternalLinkIcon className="size-3.5" />
        </a>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">{data.answer}</p>

      {canPreview && (
        <div className="relative aspect-video overflow-hidden rounded border border-border bg-muted/10">
          {isVideo ? (
            <video className="size-full object-contain" controls playsInline preload="metadata" src={data.assetUrl} />
          ) : (
            <img alt={data.assetName} className="size-full object-contain" loading="lazy" src={data.assetUrl} />
          )}
        </div>
      )}
    </div>
  );
}
