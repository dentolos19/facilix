import Hls from "hls.js";
import { VideoIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface CctvPlayerProps {
  /** HLS manifest URL (.m3u8) – when falsy the component shows a setup prompt. */
  hlsUrl?: string | null;
  /** Stream name shown in the REC overlay (e.g. "b0"). */
  streamName?: string;
  /** Called when the stream URL or availability changes. */
  onStatusChange?: (ok: boolean) => void;
}

type PlayerState = "loading" | "playing" | "error" | "idle";

/**
 * CCTV live-feed player.
 *
 * Plays an HLS stream via hls.js (or native HLS in Safari).
 * Shows appropriate states: setup prompt, loading, live, error.
 */
export function CctvPlayer({ hlsUrl, streamName, onStatusChange }: CctvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState<PlayerState>("idle");

  // Track latest onStatusChange to avoid stale closures
  const onStatusRef = useRef(onStatusChange);
  onStatusRef.current = onStatusChange;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) {
      setState("idle");
      return;
    }

    setState("loading");

    // Native HLS (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl") && "ManagedMediaSource" in window) {
      video.src = hlsUrl;
      video
        .play()
        .then(() => {
          setState("playing");
          onStatusRef.current?.(true);
        })
        .catch(() => {
          setState("error");
          onStatusRef.current?.(false);
        });
      return () => {
        video.src = "";
      };
    }

    // hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video
          .play()
          .then(() => {
            setState("playing");
            onStatusRef.current?.(true);
          })
          .catch(() => {
            // Autoplay may be blocked — still consider it "playing" once loaded
            setState("playing");
            onStatusRef.current?.(true);
          });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setState("error");
          onStatusRef.current?.(false);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
        setState("idle");
      };
    }

    // Unsupported
    setState("error");
    onStatusRef.current?.(false);
  }, [hlsUrl]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (!hlsUrl) {
    return <Placeholder icon={VideoIcon} text="Connect a stream source to view live footage" />;
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-none border border-border bg-muted/40">
      <video className="size-full object-contain" muted playsInline ref={videoRef} />

      {/* State overlays */}
      {(state === "loading" || state === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80">
          {state === "loading" && (
            <>
              <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span className="text-[11px] text-muted-foreground/60">Connecting…</span>
            </>
          )}
          {state === "error" && (
            <>
              <VideoIcon className="size-6 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground/50">Stream unavailable</span>
            </>
          )}
        </div>
      )}

      {/* Recording indicator */}
      {state === "playing" && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5">
          <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-medium text-white/80 uppercase">LIVE</span>
          {streamName && <span className="ml-1 text-[9px] text-white/60">{streamName}</span>}
        </div>
      )}

      {/* Timestamp */}
      <div className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5">
        <span className="text-[9px] font-medium text-white/80 tabular-nums">{new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Placeholder({ icon: Icon, text }: { icon: React.FC<{ className?: string }>; text: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-none border border-border bg-muted/40">
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Icon className="size-6 text-muted-foreground/40" />
        <span className="text-[11px] text-muted-foreground/50">{text}</span>
      </div>
    </div>
  );
}
