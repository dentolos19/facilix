import { AlertTriangleIcon, VideoIcon } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogContent } from "#/components/ui/dialog";
import type { UiMediaGallery, UiMediaEntry } from "#/lib/chat/ui";

export function MediaGalleryCard({ data }: { data: UiMediaGallery }) {
  const [preview, setPreview] = useState<UiMediaEntry | null>(null);

  if (data.entries.length === 0) {
    return (
      <div className="border-border bg-muted/10 my-2 flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
        <VideoIcon className="text-muted-foreground/40 size-6" />
        <p className="text-muted-foreground/60 text-[11px]">No media available</p>
      </div>
    );
  }

  const entries = data.entries.slice(0, 12);

  return (
    <>
      <div className="border-border my-2 rounded-lg border">
        <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-4">
          {entries.map((entry) => (
            <button
              aria-label={`View ${entry.name}`}
              className="border-border bg-muted/20 group relative aspect-video overflow-hidden rounded border transition-colors hover:bg-muted/40"
              key={entry.id}
              onClick={() => setPreview(entry)}
              type="button"
            >
              {entry.kind === "video" ? (
                <div className="flex size-full flex-col items-center justify-center gap-1">
                  <VideoIcon className="text-muted-foreground/50 size-5" />
                  <span className="text-muted-foreground/40 text-[8px]">
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
              {entry.source === "prediction" && (
                <span className="bg-primary/80 absolute top-1 right-1 rounded px-1 py-0.5 text-[7px] text-white">
                  AI
                </span>
              )}
            </button>
          ))}
        </div>
        {data.entries.length > 12 && (
          <div className="border-border/50 bg-muted/20 border-t px-3 py-1.5 text-center">
            <span className="text-muted-foreground/50 text-[10px]">
              {data.entries.length} media files total
            </span>
          </div>
        )}
      </div>

      <Dialog onOpenChange={(open) => { if (!open) setPreview(null); }} open={preview !== null}>
        <DialogContent className="flex h-[85vh] max-w-3xl flex-col items-center justify-center gap-2 p-4">
          {preview?.kind === "video" ? (
            <video
              className="max-h-full max-w-full object-contain"
              controls
              playsInline
              src={preview.url}
            />
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
            <AlertTriangleIcon className="text-muted-foreground size-8" />
          )}
          {preview && (
            <p className="text-muted-foreground text-[11px]">{preview.name}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
