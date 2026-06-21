import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  VideoIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RecordingDetection, RecordingRow } from "#/lib/functions/recordings";
import { cn } from "#/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlaybackPlayerProps {
  recordings: RecordingRow[];
  className?: string;
}

type PlayerState = "idle" | "loading" | "playing" | "error" | "ended";

/** A segment in the combined timeline. */
interface Segment {
  recording: RecordingRow;
  /** Start position in the combined timeline (seconds). */
  combinedStart: number;
  /** End position in the combined timeline (seconds). */
  combinedEnd: number;
  /** Duration of this segment in seconds. */
  duration: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const;

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimestamp(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function PlaybackPlayer({ recordings, className }: PlaybackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);

  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // ── Segment mapping ──────────────────────────────────────────────────────

  const segments: Segment[] = useMemo(() => {
    const sorted = [...recordings]
      .filter((r) => r.durationSec && r.durationSec > 0)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    let cursor = 0;
    return sorted.map((rec) => {
      const dur = rec.durationSec ?? 10;
      const seg: Segment = {
        recording: rec,
        combinedStart: cursor,
        combinedEnd: cursor + dur,
        duration: dur,
      };
      cursor += dur;
      return seg;
    });
  }, [recordings]);

  const totalDuration = useMemo(() => segments.reduce((sum, s) => sum + s.duration, 0), [segments]);

  const currentSegment = segments[currentSegmentIdx] ?? null;

  /** Map combined time → { segment index, offset within segment }. */
  const combinedToSegment = useCallback(
    (t: number) => {
      for (let i = 0; i < segments.length; i++) {
        if (t < segments[i].combinedEnd || i === segments.length - 1) {
          return { idx: i, offset: Math.max(0, t - segments[i].combinedStart) };
        }
      }
      return { idx: 0, offset: 0 };
    },
    [segments],
  );

  // ── Video source ─────────────────────────────────────────────────────────

  const videoSrc = useMemo(() => {
    if (!currentSegment) return "";
    return `/assets/${encodeURIComponent(currentSegment.recording.assetId)}`;
  }, [currentSegment]);

  // ── Sync video element with state ────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.src = videoSrc;
    video.load();
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = 1;
    video.muted = isMuted;
  }, [isMuted]);

  // ── Video event listeners ────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (isSeeking) return;
      const seg = segments[currentSegmentIdx];
      if (!seg) return;
      setCurrentTime(seg.combinedStart + video.currentTime);
    };

    const onWaiting = () => setPlayerState("loading");
    const onPlaying = () => setPlayerState("playing");

    const onEnded = () => {
      // Advance to next segment
      if (currentSegmentIdx < segments.length - 1) {
        setCurrentSegmentIdx((i) => i + 1);
        // The src change effect will load the next video; we auto-play below
      } else {
        setPlayerState("ended");
      }
    };

    const onError = () => {
      console.error("playback error", {
        assetId: segments[currentSegmentIdx]?.recording.assetId,
        src: videoSrc,
      });
      setPlayerState("error");
    };

    const onCanPlay = () => {
      setPlayerState("playing");
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [currentSegmentIdx, segments, videoSrc, isSeeking]);

  // Auto-play when segment changes (unless we just ended)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playerState === "ended") return;

    const onCanPlayOnce = () => {
      video.play().catch(() => {});
      video.removeEventListener("canplay", onCanPlayOnce);
    };
    video.addEventListener("canplay", onCanPlayOnce);

    return () => video.removeEventListener("canplay", onCanPlayOnce);
  }, [currentSegmentIdx, playerState]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playerState === "ended") {
      // Restart from beginning
      setCurrentSegmentIdx(0);
      setCurrentTime(0);
      setPlayerState("idle");
      return;
    }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }, [playerState]);

  const seekTo = useCallback(
    (combinedTime: number) => {
      const { idx, offset } = combinedToSegment(combinedTime);
      if (idx !== currentSegmentIdx) {
        setCurrentSegmentIdx(idx);
      }
      // Seek the video after a tick (src may need to load)
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          video.currentTime = offset;
          setCurrentTime(combinedTime);
        }
      });
    },
    [combinedToSegment, currentSegmentIdx],
  );

  const skipForward = useCallback(() => {
    seekTo(Math.min(currentTime + 10, totalDuration));
  }, [currentTime, totalDuration, seekTo]);

  const skipBack = useCallback(() => {
    seekTo(Math.max(currentTime - 10, 0));
  }, [currentTime, seekTo]);

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = SPEED_OPTIONS.indexOf(prev as (typeof SPEED_OPTIONS)[number]);
      return SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => !m);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skipBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          skipForward();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, skipBack, skipForward, toggleFullscreen, toggleMute]);

  // ── Seek bar interaction ─────────────────────────────────────────────────

  const handleSeekBarInteraction = useCallback(
    (clientX: number) => {
      const bar = seekRef.current;
      if (!bar || totalDuration === 0) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seekTo(pct * totalDuration);
    },
    [totalDuration, seekTo],
  );

  const onSeekMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsSeeking(true);
      handleSeekBarInteraction(e.clientX);

      const onMove = (ev: MouseEvent) => handleSeekBarInteraction(ev.clientX);
      const onUp = () => {
        setIsSeeking(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [handleSeekBarInteraction],
  );

  // ── Derived overlay data ─────────────────────────────────────────────────

  const activeAnomalies = useMemo(() => {
    if (!currentSegment) return [];
    const seg = currentSegment;
    const offset = currentTime - seg.combinedStart;
    const anomalies = seg.recording.data?.anomalies ?? [];
    return anomalies.filter((a) => offset >= a.atSec && offset < a.atSec + 2);
  }, [currentSegment, currentTime]);

  const activeDetections = useMemo(() => {
    if (!currentSegment) return [];
    const seg = currentSegment;
    const offset = currentTime - seg.combinedStart;
    const detections = seg.recording.data?.detections ?? [];
    return detections.filter((d) => {
      if (d.atSec === undefined) return false;
      return offset >= d.atSec && offset < d.atSec + 0.5;
    });
  }, [currentSegment, currentTime]);

  // All anomalies across segments for the combined timeline
  const allAnomalies = useMemo(() => {
    return segments.flatMap((seg) =>
      (seg.recording.data?.anomalies ?? []).map((a) => ({
        ...a,
        combinedTime: seg.combinedStart + a.atSec,
      })),
    );
  }, [segments]);

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // ── Empty state ──────────────────────────────────────────────────────────

  if (segments.length === 0) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col items-center justify-center gap-3", className)}>
        <VideoIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-[11px]">No playable recordings.</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex h-full min-h-0 flex-row gap-3", className)} ref={containerRef}>
      {/* ─ Left: Video + Controls ──────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* Video area */}
        <div className="border-border bg-muted/40 relative min-h-0 flex-1 overflow-hidden rounded-none border">
          <video
            className="size-full object-contain"
            crossOrigin="anonymous"
            onClick={togglePlay}
            playsInline
            preload="metadata"
            ref={videoRef}
          />

          {/* Recorded time overlay */}
          {currentSegment && (
            <div className="border-border bg-background/80 text-foreground/70 pointer-events-none absolute top-2 left-2 z-10 rounded-none border px-2 py-1 font-mono text-[10px] tabular-nums backdrop-blur-sm">
              {formatTimestamp(
                new Date(
                  new Date(currentSegment.recording.startedAt).getTime() +
                    (currentTime - currentSegment.combinedStart) * 1000,
                ),
              )}
            </div>
          )}

          {/* Loading overlay */}
          {playerState === "loading" && (
            <div className="bg-muted/80 pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="border-muted-foreground/30 border-t-muted-foreground size-5 animate-spin rounded-full border-2" />
              <span className="text-muted-foreground/60 text-[11px]">Loading segment…</span>
            </div>
          )}

          {/* Error overlay */}
          {playerState === "error" && (
            <div className="bg-muted/80 absolute inset-0 flex flex-col items-center justify-center gap-2">
              <VideoIcon className="text-muted-foreground/40 size-6" />
              <span className="text-muted-foreground/50 text-[11px]">Recording unavailable</span>
            </div>
          )}

          {/* Ended overlay */}
          {playerState === "ended" && (
            <button
              className="bg-muted/80 hover:bg-muted/60 absolute inset-0 flex flex-col items-center justify-center gap-2 transition-colors"
              onClick={togglePlay}
              type="button"
            >
              <PlayIcon className="text-muted-foreground/60 size-8" />
              <span className="text-muted-foreground/50 text-[11px]">Playback finished — click to replay</span>
            </button>
          )}

          {/* Active anomaly chips */}
          {activeAnomalies.length > 0 && (
            <div className="absolute top-2 left-2 z-10 flex max-w-[70%] flex-wrap gap-1">
              {activeAnomalies.map((a, i) => (
                <span
                  className="inline-flex items-center gap-1 rounded-none border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700"
                  key={`${a.label}-${a.atSec}-${i}`}
                >
                  <PlayIcon className="size-2.5 fill-current" />
                  {a.label} ({Math.round(a.confidence * 100)}%)
                </span>
              ))}
            </div>
          )}

          {/* Bounding box overlay */}
          {activeDetections.length > 0 && <BoundingBoxOverlay detections={activeDetections} videoRef={videoRef} />}

          {/* Segment badge */}
          {currentSegment && (
            <div className="border-border bg-background/80 text-foreground/60 absolute right-2 bottom-14 z-10 rounded-none border px-2 py-1 text-[9px] backdrop-blur-sm">
              Segment {currentSegmentIdx + 1}/{segments.length}
            </div>
          )}
        </div>

        {/* Custom controls bar */}
        <div className="border-border bg-muted/20 flex shrink-0 flex-col gap-2 rounded-none border p-2">
          {/* Seek bar */}
          <div className="group relative flex items-center">
            <div
              className="bg-muted relative h-1.5 w-full cursor-pointer rounded-full transition-colors group-hover:h-2"
              onMouseDown={onSeekMouseDown}
              ref={seekRef}
            >
              {/* Segment dividers */}
              {segments.map((seg, i) => {
                if (i === 0) return null;
                const pct = (seg.combinedStart / totalDuration) * 100;
                return (
                  <div
                    className="bg-foreground/20 absolute top-0 z-10 h-full w-px"
                    key={seg.recording.id}
                    style={{ left: `${pct}%` }}
                  />
                );
              })}

              {/* Anomaly markers */}
              {allAnomalies.map((a, i) => {
                const pct = (a.combinedTime / totalDuration) * 100;
                return (
                  <div
                    className="absolute top-0 z-10 h-full w-1 rounded-full bg-amber-500/60"
                    key={`anomaly-${i}`}
                    style={{ left: `${pct}%` }}
                    title={`${a.label} at ${formatTime(a.combinedTime)}`}
                  />
                );
              })}

              {/* Progress fill */}
              <div
                className="bg-foreground/60 absolute top-0 h-full rounded-full transition-[width] duration-75"
                style={{ width: `${progressPct}%` }}
              />

              {/* Playhead */}
              <div
                className="bg-foreground absolute top-1/2 z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                style={{ left: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1">
            {/* Play / Pause */}
            <button
              className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors"
              onClick={togglePlay}
              type="button"
              title={playerState === "playing" ? "Pause (Space)" : "Play (Space)"}
            >
              {playerState === "playing" ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            </button>

            {/* Skip back 10s */}
            <button
              className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors"
              onClick={skipBack}
              type="button"
              title="Back 10s (←)"
            >
              <SkipBackIcon className="size-3.5" />
            </button>

            {/* Skip forward 10s */}
            <button
              className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors"
              onClick={skipForward}
              type="button"
              title="Forward 10s (→)"
            >
              <SkipForwardIcon className="size-3.5" />
            </button>

            {/* Time display */}
            <span className="text-foreground/60 ml-1 font-mono text-[10px] tabular-nums">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Current segment info */}
            {currentSegment && (
              <span className="text-foreground/40 mr-2 text-[9px]">
                {formatTimestamp(currentSegment.recording.startedAt)}
                {currentSegment.recording.endedAt ? ` – ${formatTimestamp(currentSegment.recording.endedAt)}` : ""}
              </span>
            )}

            {/* Speed */}
            <button
              className="text-foreground/70 hover:bg-muted hover:text-foreground flex h-7 min-w-7 items-center justify-center rounded-none px-1 text-[10px] font-medium transition-colors"
              onClick={cycleSpeed}
              type="button"
              title="Playback speed"
            >
              {playbackRate}×
            </button>

            {/* Volume */}
            <button
              className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors"
              onClick={toggleMute}
              type="button"
              title={isMuted ? "Unmute (M)" : "Mute (M)"}
            >
              {isMuted ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
            </button>

            {/* Fullscreen */}
            <button
              className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors"
              onClick={toggleFullscreen}
              type="button"
              title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
            >
              {isFullscreen ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ─ Right: Analysis panels ──────────────────────────────────────── */}
      {currentSegment && (
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
          <AnalysisPanel segment={currentSegment} currentTime={currentTime} />
        </div>
      )}
    </div>
  );
}

// ─── Analysis Panel ─────────────────────────────────────────────────────────

function AnalysisPanel({ segment, currentTime }: { segment: Segment; currentTime: number }) {
  const data = segment.recording.data ?? {};
  const sceneSummary = data.sceneSummary ?? null;
  const anomalies = data.anomalies ?? [];
  const detectionCounts = data.detectionCounts ?? {};

  const offset = currentTime - segment.combinedStart;

  return (
    <div className="flex flex-col gap-3">
      {sceneSummary && (
        <div className="border-border bg-muted/20 rounded-none border p-3">
          <h3 className="font-heading text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase">
            Scene understanding
          </h3>
          <p className="text-foreground/80 text-[11px] leading-relaxed">{sceneSummary}</p>
        </div>
      )}

      <div className="border-border bg-muted/20 rounded-none border p-3">
        <h3 className="font-heading text-muted-foreground mb-2 text-[10px] font-medium tracking-wider uppercase">
          Detections
        </h3>
        {Object.keys(detectionCounts).length === 0 ? (
          <p className="text-muted-foreground/50 text-[11px]">No detections for this segment.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {Object.entries(detectionCounts)
              .filter(([key]) => !key.startsWith("__"))
              .map(([label, count]) => (
                <li
                  className="border-border bg-background text-foreground/80 rounded-none border px-2 py-1 text-[10px]"
                  key={label}
                >
                  {count}× {label}
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Anomaly timeline */}
      {anomalies.length > 0 && (
        <div className="border-border bg-muted/20 shrink-0 rounded-none border p-3">
          <h3 className="font-heading text-muted-foreground mb-2 text-[10px] font-medium tracking-wider uppercase">
            Anomaly timeline
          </h3>
          <div className="flex flex-col gap-1.5">
            {anomalies.map((a, i) => (
              <button
                className={cn(
                  "shrink-0 rounded-none border px-2 py-1 text-left text-[10px] transition-colors",
                  offset >= a.atSec && offset < a.atSec + 2
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-700"
                    : "border-border bg-background text-foreground/70 hover:bg-muted",
                )}
                key={`${a.label}-${a.atSec}-${i}`}
                onClick={() => {
                  // This would require a seek callback; skip for now
                }}
                type="button"
              >
                <span className="font-mono tabular-nums">{formatTime(a.atSec)}</span>
                <span className="ml-1.5">{a.label}</span>
                <span className="text-muted-foreground/60 ml-1">{Math.round(a.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bounding Box Overlay ───────────────────────────────────────────────────

function BoundingBoxOverlay({
  detections,
  videoRef,
}: {
  detections: RecordingDetection[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current?.parentElement;
    if (!video || !container) return;

    const updateSizes = () => {
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
    };

    updateSizes();
    video.addEventListener("loadedmetadata", updateSizes);
    video.addEventListener("resize", updateSizes);

    const resizeObserver = new ResizeObserver(updateSizes);
    resizeObserver.observe(container);

    return () => {
      video.removeEventListener("loadedmetadata", updateSizes);
      video.removeEventListener("resize", updateSizes);
      resizeObserver.disconnect();
    };
  }, [videoRef]);

  if (videoSize.width === 0 || videoSize.height === 0 || containerSize.width === 0) {
    return null;
  }

  const videoAspect = videoSize.width / videoSize.height;
  const containerAspect = containerSize.width / containerSize.height;

  let displayWidth: number;
  let displayHeight: number;
  let offsetX = 0;
  let offsetY = 0;

  if (videoAspect > containerAspect) {
    displayWidth = containerSize.width;
    displayHeight = containerSize.width / videoAspect;
    offsetY = (containerSize.height - displayHeight) / 2;
  } else {
    displayHeight = containerSize.height;
    displayWidth = containerSize.height * videoAspect;
    offsetX = (containerSize.width - displayWidth) / 2;
  }

  const scaleX = displayWidth / videoSize.width;
  const scaleY = displayHeight / videoSize.height;

  return (
    <div className="pointer-events-none absolute inset-0" ref={containerRef}>
      {detections.map((d, i) => {
        if (!d.box) return null;
        const left = offsetX + d.box.xmin * scaleX;
        const top = offsetY + d.box.ymin * scaleY;
        const width = (d.box.xmax - d.box.xmin) * scaleX;
        const height = (d.box.ymax - d.box.ymin) * scaleY;

        return (
          <div
            className="absolute border-2 border-amber-500 bg-amber-500/10"
            key={`${d.label}-${i}`}
            style={{ left, top, width, height }}
          >
            <span className="absolute -top-5 left-0 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-medium whitespace-nowrap text-white">
              {d.label} {Math.round(d.confidence * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
