import Hls from "hls.js";
import {
  MaximizeIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "#/components/ui/button.tsx";
import { Dialog, DialogContent } from "#/components/ui/dialog.tsx";
import { cn } from "#/lib/utils.ts";

export interface CctvPlayerProps {
  /** HLS manifest URL (.m3u8) – when falsy the component shows a setup prompt. */
  hlsUrl?: string | null;
  /** Stream name shown in the REC overlay (e.g. "b0"). */
  streamName?: string;
  /** Called when the stream URL or availability changes. */
  onStatusChange?: (ok: boolean) => void;
}

type PlayerState = "loading" | "playing" | "error" | "idle";

// ─── HLS player hook ────────────────────────────────────────────────────────

function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  hlsUrl: string | null | undefined,
  onStatus?: (ok: boolean) => void,
): PlayerState {
  const [state, setState] = useState<PlayerState>("idle");
  const hlsRef = useRef<Hls | null>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

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
  }, [hlsUrl, videoRef]);

  return state;
}

// ─── Shared video element ───────────────────────────────────────────────────

function HlsVideoElement({
  hlsUrl,
  onStatusChange,
  videoRef,
  className,
  ...videoProps
}: React.ComponentPropsWithoutRef<"video"> & {
  hlsUrl?: string | null;
  onStatusChange?: (ok: boolean) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const state = useHlsPlayer(videoRef, hlsUrl, onStatusChange);

  return (
    <>
      <video
        ref={videoRef}
        className={cn("size-full object-contain", className)}
        muted
        playsInline
        {...videoProps}
      />

      {/* State overlays — use parent's nearest positioned ancestor */}
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
    </>
  );
}

// ─── Main CCTV Player ───────────────────────────────────────────────────────

export function CctvPlayer({ hlsUrl, streamName, onStatusChange }: CctvPlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!hlsUrl) {
    return <Placeholder icon={VideoIcon} text="Connect a stream source to view live footage" />;
  }

  return (
    <>
      {/* Small player — click to expand */}
      <div
        className="relative aspect-video w-full overflow-hidden rounded-none border border-border bg-muted/40 cursor-pointer"
        onClick={() => setExpanded(true)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Open expanded video view"
      >
        <HlsVideoElement hlsUrl={hlsUrl} onStatusChange={onStatusChange} videoRef={videoRef} />

        {/* REC/LIVE indicator */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5 pointer-events-none">
          <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-medium text-white/80 uppercase">LIVE</span>
          {streamName && <span className="ml-1 text-[9px] text-white/60">{streamName}</span>}
        </div>
      </div>

      {/* Expanded dialog */}
      <CctvExpandedDialog
        hlsUrl={hlsUrl}
        streamName={streamName}
        open={expanded}
        onOpenChange={setExpanded}
      />
    </>
  );
}

// ─── Expanded Dialog ────────────────────────────────────────────────────────

function CctvExpandedDialog({
  hlsUrl,
  streamName,
  open,
  onOpenChange,
}: {
  hlsUrl: string;
  streamName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const state = useHlsPlayer(videoRef, hlsUrl);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // Track play/pause state from the video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [open]);

  // Track current time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);

    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [open]);

  // Auto-hide controls after inactivity
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (open) resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [open, resetHideTimer]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setPlaying(true);
      setMuted(true);
      setVolume(1);
      setCurrentTime(0);
    }
  }, [open]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
    resetHideTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    resetHideTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = parseFloat(e.target.value);
    video.volume = val;
    video.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
    resetHideTimer();
  };

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] sm:max-w-[95vw] p-0 gap-0 bg-black overflow-hidden"
        showCloseButton={false}
      >
        <div
          className="relative aspect-video w-full bg-black"
          onMouseMove={resetHideTimer}
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => {
            clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => setShowControls(false), 2000);
          }}
        >
          <HlsVideoElement hlsUrl={hlsUrl} videoRef={videoRef} />

          {/* Large centered play button when paused */}
          {!playing && state === "playing" && (
            <button
              className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
              onClick={togglePlay}
              aria-label="Play"
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform hover:scale-105">
                <PlayIcon className="size-7 text-white fill-white" />
              </div>
            </button>
          )}

          {/* Top bar — stream name + close */}
          <div
            className={cn(
              "absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-200",
              showControls ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[11px] font-medium text-white/80 uppercase">LIVE</span>
              {streamName && (
                <span className="text-[11px] text-white/60 font-mono">{streamName}</span>
              )}
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          {/* Bottom controls bar */}
          <div
            className={cn(
              "absolute bottom-0 left-0 right-0 transition-opacity duration-200",
              showControls ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <div className="px-3 pt-8 pb-3 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-1">
                {/* Play/Pause */}
                <button
                  className="flex size-8 items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={togglePlay}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
                </button>

                {/* Volume */}
                <button
                  className="flex size-8 items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 accent-white/80 cursor-pointer"
                  aria-label="Volume"
                />

                {/* Time */}
                <span className="text-[11px] text-white/60 font-mono tabular-nums ml-1">
                  {formatTime(currentTime)}
                </span>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Fullscreen */}
                <button
                  className="flex size-8 items-center justify-center rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={toggleFullscreen}
                  aria-label="Fullscreen"
                >
                  <MaximizeIcon className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Placeholder ────────────────────────────────────────────────────────────

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
