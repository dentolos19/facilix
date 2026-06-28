import Hls from "hls.js";
import { MaximizeIcon, PauseIcon, PlayIcon, VideoIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent } from "#/components/ui/dialog";
import { cn } from "#/lib/utils";

import { ObjectDetectionOverlay } from "./object-detection-overlay";

export interface CctvPlayerProps {
  /** HLS manifest URL (.m3u8) – when falsy the component shows a setup prompt. */
  hlsUrl?: string | null;
  /** Stream name shown in the REC overlay (e.g. "b0"). */
  streamName?: string;
  /** Called when the stream URL or availability changes. */
  onStatusChange?: (ok: boolean) => void;
  /** Enable browser-based object detection overlay using MediaPipe. */
  objectDetectionEnabled?: boolean;
  /** Show playback controls inline on the player instead of only in the expanded dialog. */
  showAdvancedControls?: boolean;
  /** Allow clicking the player to open the expanded dialog. */
  enableExpandedDialog?: boolean;
  className?: string;
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
        className={cn("size-full object-contain", className)}
        crossOrigin="anonymous"
        muted
        playsInline
        ref={videoRef}
        {...videoProps}
      />

      {/* State overlays — use parent's nearest positioned ancestor */}
      {(state === "loading" || state === "error") && (
        <div className="bg-muted/80 absolute inset-0 flex flex-col items-center justify-center gap-2">
          {state === "loading" && (
            <>
              <div className="border-muted-foreground/30 border-t-muted-foreground size-5 animate-spin rounded-full border-2" />
              <span className="text-muted-foreground/60 text-[11px]">Connecting…</span>
            </>
          )}
          {state === "error" && (
            <>
              <VideoIcon className="text-muted-foreground/40 size-6" />
              <span className="text-muted-foreground/50 text-[11px]">Stream unavailable</span>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main CCTV Player ───────────────────────────────────────────────────────

export function CctvPlayer({
  hlsUrl,
  onStatusChange,
  objectDetectionEnabled,
  showAdvancedControls = false,
  enableExpandedDialog = true,
  className,
}: CctvPlayerProps) {
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controls = usePlaybackControls(videoRef);

  if (!hlsUrl) {
    return (
      <Placeholder
        className={cn(showAdvancedControls ? "h-full min-h-0" : "aspect-video", className)}
        icon={VideoIcon}
        text="Connect a stream source to view live footage"
      />
    );
  }

  const openExpanded = () => {
    if (enableExpandedDialog) setExpanded(true);
  };

  return (
    <>
      {/* Player */}
      <div
        aria-label={enableExpandedDialog ? "Open expanded video view" : undefined}
        className={cn(
          "relative w-full overflow-hidden rounded-none border border-border bg-muted/40",
          showAdvancedControls ? "h-full min-h-0" : "aspect-video",
          enableExpandedDialog && "cursor-pointer",
          className,
        )}
        onClick={enableExpandedDialog ? openExpanded : undefined}
        onKeyDown={
          enableExpandedDialog
            ? (e: KeyboardEvent) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                openExpanded();
              }
            : undefined
        }
        role={enableExpandedDialog ? "button" : undefined}
        tabIndex={enableExpandedDialog ? 0 : undefined}
      >
        <HlsVideoElement hlsUrl={hlsUrl} onStatusChange={onStatusChange} videoRef={videoRef} />

        {showAdvancedControls && !controls.playing && (
          <button
            aria-label="Play"
            className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/10"
            onClick={(event) => {
              event.stopPropagation();
              controls.togglePlay();
            }}
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform hover:scale-105">
              <PlayIcon className="size-7 fill-white" />
            </span>
          </button>
        )}

        {showAdvancedControls && (
          <InlinePlaybackControls
            currentTime={controls.currentTime}
            muted={controls.muted}
            onVolumeChange={controls.setVideoVolume}
            playing={controls.playing}
            toggleFullscreen={controls.toggleFullscreen}
            toggleMute={controls.toggleMute}
            togglePlay={controls.togglePlay}
            volume={controls.volume}
          />
        )}

        {/* Object detection overlay */}
        <ObjectDetectionOverlay enabled={!!objectDetectionEnabled} videoRef={videoRef} />

        {/* REC/LIVE indicator */}
        <div className="pointer-events-none absolute top-2 left-2 z-20 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5">
          <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-[9px] font-medium text-white/80 uppercase">LIVE</span>
        </div>
      </div>

      {enableExpandedDialog && <CctvExpandedDialog hlsUrl={hlsUrl} onOpenChange={setExpanded} open={expanded} />}
    </>
  );
}

function usePlaybackControls(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setPlaying(!video.paused);
      setMuted(video.muted);
      setVolume(video.volume);
      setCurrentTime(video.currentTime);
    };

    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("timeupdate", sync);
    video.addEventListener("volumechange", sync);
    sync();

    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("volumechange", sync);
    };
  }, [videoRef]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const setVideoVolume = (nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  return { currentTime, muted, playing, setVideoVolume, toggleFullscreen, toggleMute, togglePlay, volume };
}

function InlinePlaybackControls({
  currentTime,
  muted,
  playing,
  toggleFullscreen,
  toggleMute,
  togglePlay,
  volume,
  onVolumeChange,
}: {
  currentTime: number;
  muted: boolean;
  playing: boolean;
  toggleFullscreen: () => void;
  toggleMute: () => void;
  togglePlay: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}) {
  return (
    <div className="absolute right-0 bottom-0 left-0 z-20 bg-gradient-to-t from-black/85 to-transparent px-3 pt-10 pb-3">
      <div className="flex items-center gap-1">
        <button
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            togglePlay();
          }}
        >
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
        </button>
        <button
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex size-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            toggleMute();
          }}
        >
          {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </button>
        <input
          aria-label="Volume"
          className="h-1 w-20 cursor-pointer accent-white/80"
          max={1}
          min={0}
          onChange={(event) => onVolumeChange(parseFloat(event.target.value))}
          onClick={(event) => event.stopPropagation()}
          step={0.05}
          type="range"
          value={muted ? 0 : volume}
        />
        <span className="ml-1 font-mono text-[11px] text-white/60 tabular-nums">{formatTime(currentTime)}</span>
        <div className="flex-1" />
        <button
          aria-label="Fullscreen"
          className="flex size-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            toggleFullscreen();
          }}
        >
          <MaximizeIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function formatTime(t: number) {
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ─── Expanded Dialog ────────────────────────────────────────────────────────

function CctvExpandedDialog({
  hlsUrl,
  open,
  onOpenChange,
}: {
  hlsUrl: string;
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
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="w-[85vw] max-w-[85vw] gap-0 overflow-hidden bg-black p-0 sm:max-w-[85vw]"
        showCloseButton={false}
      >
        <div
          className="relative aspect-video w-full bg-black"
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => {
            clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => setShowControls(false), 2000);
          }}
          onMouseMove={resetHideTimer}
        >
          <HlsVideoElement hlsUrl={hlsUrl} videoRef={videoRef} />

          {/* Large centered play button when paused */}
          {!playing && state === "playing" && (
            <button
              aria-label="Play"
              className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/20"
              onClick={togglePlay}
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform hover:scale-105">
                <PlayIcon className="size-7 fill-white text-white" />
              </div>
            </button>
          )}

          {/* Top bar — stream name + close */}
          <div
            className={cn(
              "absolute top-0 right-0 left-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 transition-opacity duration-200",
              showControls ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="size-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-[11px] font-medium text-white/80 uppercase">LIVE</span>
            </div>
            <Button
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => onOpenChange(false)}
              size="icon-sm"
              variant="ghost"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          {/* Bottom controls bar */}
          <div
            className={cn(
              "absolute right-0 bottom-0 left-0 transition-opacity duration-200",
              showControls ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div className="bg-gradient-to-t from-black/80 to-transparent px-3 pt-8 pb-3">
              <div className="flex items-center gap-1">
                {/* Play/Pause */}
                <button
                  aria-label={playing ? "Pause" : "Play"}
                  className="flex size-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={togglePlay}
                >
                  {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
                </button>

                {/* Volume */}
                <button
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="flex size-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={toggleMute}
                >
                  {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
                </button>
                <input
                  aria-label="Volume"
                  className="h-1 w-16 cursor-pointer accent-white/80"
                  max={1}
                  min={0}
                  onChange={handleVolumeChange}
                  step={0.05}
                  type="range"
                  value={muted ? 0 : volume}
                />

                {/* Time */}
                <span className="ml-1 font-mono text-[11px] text-white/60 tabular-nums">{formatTime(currentTime)}</span>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Fullscreen */}
                <button
                  aria-label="Fullscreen"
                  className="flex size-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={toggleFullscreen}
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

function Placeholder({
  className,
  icon: Icon,
  text,
}: {
  className?: string;
  icon: React.FC<{ className?: string }>;
  text: string;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden rounded-none border border-border bg-muted/40", className)}>
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Icon className="text-muted-foreground/40 size-6" />
        <span className="text-muted-foreground/50 text-[11px]">{text}</span>
      </div>
    </div>
  );
}
