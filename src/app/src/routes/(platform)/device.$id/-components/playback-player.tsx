import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VideoIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScrollArea } from "#/components/ui/scroll-area";
import type { RecordingRow, VideoFrameRow } from "#/lib/functions/recordings";
import { cn } from "#/lib/utils";

import { getDetectionRect } from "./detection-frame-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlaybackPlayerProps {
  recordings: RecordingRow[];
  detections?: VideoFrameRow[];
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

export function PlaybackPlayer({ recordings, detections = [], className }: PlaybackPlayerProps) {
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

    return sorted.reduce<Segment[]>((result, rec) => {
      const combinedStart = result.at(-1)?.combinedEnd ?? 0;
      const duration = rec.durationSec ?? 10;
      return [
        ...result,
        {
          recording: rec,
          combinedStart,
          combinedEnd: combinedStart + duration,
          duration,
        },
      ];
    }, []);
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

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  // ── Empty state ──────────────────────────────────────────────────────────

  if (segments.length === 0) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col items-center justify-center gap-3", className)}>
        <VideoIcon className="size-8 text-muted-foreground/30" />
        <p className="text-[11px] text-muted-foreground/50">No playable recordings.</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex h-full min-h-0 flex-row gap-3", className)} ref={containerRef}>
      {/* ─ Left: Video + Controls ──────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* Video area */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-none border border-border bg-muted/40">
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
            <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-none border border-border bg-background/80 px-2 py-1 font-mono text-[10px] text-foreground/70 tabular-nums backdrop-blur-sm">
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
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80">
              <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              <span className="text-[11px] text-muted-foreground/60">Loading segment…</span>
            </div>
          )}

          {/* Error overlay */}
          {playerState === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80">
              <VideoIcon className="size-6 text-muted-foreground/40" />
              <span className="text-[11px] text-muted-foreground/50">Recording unavailable</span>
            </div>
          )}

          {/* Ended overlay */}
          {playerState === "ended" && (
            <button
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80 transition-colors hover:bg-muted/60"
              onClick={togglePlay}
              type="button"
            >
              <PlayIcon className="size-8 text-muted-foreground/60" />
              <span className="text-[11px] text-muted-foreground/50">Playback finished — click to replay</span>
            </button>
          )}
        </div>

        {/* Custom controls bar */}
        <div className="flex shrink-0 flex-col gap-2 rounded-none border border-border bg-muted/20 p-2">
          {/* Seek bar */}
          <div className="group relative flex items-center">
            <div
              className="relative h-1.5 w-full cursor-pointer rounded-full bg-muted transition-colors group-hover:h-2"
              onMouseDown={onSeekMouseDown}
              ref={seekRef}
            >
              {/* Segment dividers */}
              {segments.map((seg, i) => {
                if (i === 0) return null;
                const pct = (seg.combinedStart / totalDuration) * 100;
                return (
                  <div
                    className="absolute top-0 z-10 h-full w-px bg-foreground/20"
                    key={seg.recording.id}
                    style={{ left: `${pct}%` }}
                  />
                );
              })}

              {/* Progress fill */}
              <div
                className="absolute top-0 h-full rounded-full bg-foreground/60 transition-[width] duration-75"
                style={{ width: `${progressPct}%` }}
              />

              {/* Playhead */}
              <div
                className="absolute top-1/2 z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground opacity-0 transition-opacity group-hover:opacity-100"
                style={{ left: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-1">
            {/* Play / Pause */}
            <button
              className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={togglePlay}
              type="button"
              title={playerState === "playing" ? "Pause (Space)" : "Play (Space)"}
            >
              {playerState === "playing" ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            </button>

            {/* Skip back 10s */}
            <button
              className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={skipBack}
              type="button"
              title="Back 10s (←)"
            >
              <SkipBackIcon className="size-3.5" />
            </button>

            {/* Skip forward 10s */}
            <button
              className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={skipForward}
              type="button"
              title="Forward 10s (→)"
            >
              <SkipForwardIcon className="size-3.5" />
            </button>

            {/* Time display */}
            <span className="ml-1 font-mono text-[10px] text-foreground/60 tabular-nums">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Current segment info */}
            {currentSegment && (
              <span className="mr-2 text-[9px] text-foreground/40">
                {formatTimestamp(currentSegment.recording.startedAt)}
                {currentSegment.recording.endedAt ? ` – ${formatTimestamp(currentSegment.recording.endedAt)}` : ""}
              </span>
            )}

            {/* Speed */}
            <button
              className="flex h-7 min-w-7 items-center justify-center rounded-none px-1 text-[10px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={cycleSpeed}
              type="button"
              title="Playback speed"
            >
              {playbackRate}×
            </button>

            {/* Volume */}
            <button
              className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              onClick={toggleMute}
              type="button"
              title={isMuted ? "Unmute (M)" : "Mute (M)"}
            >
              {isMuted ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
            </button>

            {/* Fullscreen */}
            <button
              className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
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
        <aside className="flex min-h-0 w-72 shrink-0 flex-col overflow-hidden">
          <AnalysisPanel detections={detections} segment={currentSegment} />
        </aside>
      )}
    </div>
  );
}

// ─── Analysis Panel ─────────────────────────────────────────────────────────

function AnalysisPanel({ segment, detections }: { segment: Segment; detections: VideoFrameRow[] }) {
  const data = segment.recording.data ?? {};
  const sceneSummary = data.sceneSummary ?? null;
  const detectionCounts = data.detectionCounts ?? {};

  const counts = Object.entries(detectionCounts)
    .filter(([key]) => !key.startsWith("__"))
    .sort(([, a], [, b]) => b - a);

  // Shared workflows fan out lightweight rows per plugin. Collapse rows that
  // point at the same frame so playback does not show duplicates.
  const segmentDetections = useMemo(() => {
    const byFrame = new Map<string, VideoFrameRow>();
    for (const row of detections) {
      if (row.segmentId !== segment.recording.id) continue;
      const existing = byFrame.get(row.assetId);
      if (!existing) {
        byFrame.set(row.assetId, row);
        continue;
      }
      const seen = new Set(
        existing.detections.map(
          (item) => `${item.label}:${item.frameIndex ?? ""}:${item.prediction?.detectionId ?? ""}:${item.confidence}`,
        ),
      );
      const additions = row.detections.filter(
        (item) =>
          !seen.has(`${item.label}:${item.frameIndex ?? ""}:${item.prediction?.detectionId ?? ""}:${item.confidence}`),
      );
      if (additions.length > 0) {
        byFrame.set(row.assetId, {
          ...existing,
          detections: [...existing.detections, ...additions],
        });
      }
    }
    return [...byFrame.values()];
  }, [detections, segment.recording.id]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* Detection summary */}
      <div className="shrink-0 rounded-none border border-border bg-muted/20 p-3">
        <h3 className="mb-2 font-heading text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          Detections
        </h3>
        {counts.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50">No detections for this segment.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {counts.map(([label, count]) => {
              const total = counts.reduce((sum, [, c]) => sum + c, 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div
                  className="flex items-center justify-between rounded-none border border-border bg-background px-2.5 py-1.5"
                  key={label}
                >
                  <span className="text-[11px] font-medium text-foreground/80 capitalize">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground/60" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
                      {count}×
                    </span>
                    <span className="w-8 text-right font-mono text-[10px] text-muted-foreground/50 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scene summary (collapsible, short) */}
      {sceneSummary && (
        <details className="shrink-0 rounded-none border border-border bg-muted/20">
          <summary className="cursor-pointer p-3 text-[10px] font-medium tracking-wider text-muted-foreground uppercase select-none hover:text-foreground/70">
            Scene context
          </summary>
          <p className="px-3 pb-3 text-[11px] leading-relaxed text-foreground/80">{sceneSummary}</p>
        </details>
      )}

      {/* Predicted frames */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-muted/20 p-3">
        <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
          <h3 className="font-heading text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Predicted Frames
          </h3>
          <span className="font-mono text-[9px] text-muted-foreground/50 tabular-nums">{segmentDetections.length}</span>
        </div>

        {segmentDetections.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50">No predicted frames for this segment.</p>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-2">
            <div className="flex flex-col gap-2 pb-px">
              {segmentDetections.map((pred) => {
                const labels = [...new Set(pred.detections.map((p) => p.label).filter(Boolean))];
                const { width, height } = pred.image;
                const strokeWidth = Math.max(1.5, Math.max(width, height) * 0.003);
                return (
                  <div className="rounded-none border border-border bg-background/50" key={pred.id}>
                    <div
                      className="relative flex items-center justify-center overflow-hidden bg-muted"
                      style={{ maxHeight: "120px" }}
                    >
                      <img
                        alt={`Detection frame ${pred.frameIndex}`}
                        className="max-h-[120px] w-auto object-contain"
                        decoding="async"
                        loading="lazy"
                        src={`/assets/${encodeURIComponent(pred.assetId)}`}
                      />
                      {width > 0 && height > 0 && (
                        <svg
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 size-full"
                          preserveAspectRatio="xMidYMid meet"
                          viewBox={`0 0 ${width} ${height}`}
                        >
                          {pred.detections.map((detection, index) => {
                            const rect = getDetectionRect(detection);
                            if (!rect) return null;
                            return (
                              <rect
                                fill="transparent"
                                height={rect.height}
                                key={index}
                                stroke="#84cc16"
                                strokeWidth={strokeWidth}
                                width={rect.width}
                                x={rect.x}
                                y={rect.y}
                              />
                            );
                          })}
                        </svg>
                      )}
                    </div>
                    <div className="border-t border-border px-2.5 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
                          Frame {pred.frameIndex} &middot; {pred.atSec.toFixed(1)}s
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/50">
                          {pred.detections.length} {pred.detections.length === 1 ? "detection" : "detections"}
                        </span>
                      </div>
                      {labels.length > 0 && (
                        <p className="mt-0.5 truncate text-[9px] text-muted-foreground/60">{labels.join(", ")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
