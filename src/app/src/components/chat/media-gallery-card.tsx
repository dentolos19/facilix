import { AlertTriangleIcon, VideoIcon } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent } from "#/components/ui/dialog";
import type { UiMediaEntry, UiMediaGallery } from "#/lib/chat/ui";

export function MediaGalleryCard({ data }: { data: UiMediaGallery }) {
  const [preview, setPreview] = useState<UiMediaEntry | null>(null);

  if (data.entries.length === 0) {
    return (
      <div className="my-2 flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/10 p-6 text-center">
        <VideoIcon className="size-6 text-muted-foreground/40" />
        <p className="text-[11px] text-muted-foreground/60">No media available</p>
      </div>
    );
  }

  const entries = data.entries.slice(0, 12);

  return (
    <>
      <div className="my-2 rounded-lg border border-border">
        <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-4">
          {entries.map((entry) => (
            <button
              aria-label={`View ${entry.name}`}
              className="group relative aspect-video overflow-hidden rounded border border-border bg-muted/20 transition-colors hover:bg-muted/40"
              key={entry.id}
              onClick={() => setPreview(entry)}
              type="button"
            >
              {entry.kind === "video" ? (
                <div className="flex size-full flex-col items-center justify-center gap-1">
                  <VideoIcon className="size-5 text-muted-foreground/50" />
                  <span className="text-[8px] text-muted-foreground/40">
                    {entry.durationSec ? `${entry.durationSec}s` : "Video"}
                  </span>
                </div>
              ) : (
                <img
                  alt={entry.name}
                  className="size-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                  src={entry.url}
                />
              )}
              {entry.source === "detection" && (
                <span className="absolute top-1 right-1 rounded bg-primary/80 px-1 py-0.5 text-[7px] text-white">
                  AI
                </span>
              )}
            </button>
          ))}
        </div>
        {data.entries.length > 12 && (
          <div className="border-t border-border/50 bg-muted/20 px-3 py-1.5 text-center">
            <span className="text-[10px] text-muted-foreground/50">{data.entries.length} media files total</span>
          </div>
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        open={preview !== null}
      >
        <DialogContent className="flex h-[85vh] w-[min(94vw,80rem)] max-w-none flex-col items-center justify-center gap-2 p-4 sm:max-w-none">
          {preview?.kind === "video" ? (
            <video className="max-h-full max-w-full object-contain" controls playsInline src={preview.url} />
          ) : preview ? (
            <img
              alt={preview.name}
              className="max-h-full max-w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "";
              }}
              src={preview.url}
            />
          ) : (
            <AlertTriangleIcon className="size-8 text-muted-foreground" />
          )}
          {preview && <p className="text-[11px] text-muted-foreground">{preview.name}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
