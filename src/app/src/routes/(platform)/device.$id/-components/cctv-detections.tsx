import {
  BrainCircuitIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type DetectionBox, EvidenceImage } from "#/components/evidence-image";
import { ScrollArea, ScrollBar } from "#/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import type { DeviceDetail } from "#/lib/functions/facility";
import {
  getDeviceDetections,
  getDeviceRecordings,
  type RecordingRow,
  type VideoFrameRow,
} from "#/lib/functions/recordings";
import { getPlugin } from "#/lib/monitoring/plugins";

import { getDetectionRect } from "./detection-frame-utils";

function formatWallClock(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DetectionFrame({ frame }: { frame: VideoFrameRow }) {
  const { width, height } = frame.image;
  const boxes: DetectionBox[] = [];
  for (const detection of frame.detections) {
    const rect = getDetectionRect(detection);
    if (rect) {
      boxes.push({
        label: detection.label,
        confidence: detection.confidence,
        ...rect,
      });
    }
  }

  return (
    <EvidenceImage
      alt={`Detection frame ${frame.frameIndex}`}
      detections={boxes}
      height={height}
      src={`/assets/${encodeURIComponent(frame.assetId)}`}
      width={width}
    />
  );
}

export function CctvDetectionsTab({ device }: { device: DeviceDetail }) {
  const [detections, setDetections] = useState<VideoFrameRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState("all");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineViewportRef = useRef<HTMLDivElement>(null);
  const selectedThumbnailRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [preds, recs] = await Promise.all([
          getDeviceDetections({
            data: { facilityId: device.facilityId, deviceId: device.id },
          }),
          getDeviceRecordings({
            data: { facilityId: device.facilityId, deviceId: device.id },
          }),
        ]);
        if (!cancelled) {
          const firstPluginId = preds[0]?.pluginId ?? "all";
          const pluginDetectionCount = preds.filter((detection) => detection.pluginId === firstPluginId).length;
          setDetections(preds);
          setRecordings(recs);
          setSelectedPluginId(firstPluginId);
          setSelectedIdx(Math.max(0, pluginDetectionCount - 1));
          setIsPlaying(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load detections");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [device.facilityId, device.id]);

  // Build a map from segment ID → recording for timestamp lookup
  const segmentMap = useMemo(() => {
    const map = new Map<string, RecordingRow>();
    for (const rec of recordings) {
      map.set(rec.id, rec);
    }
    return map;
  }, [recordings]);

  const pluginOptions = useMemo(() => {
    const ids = [...new Set(detections.map((detection) => detection.pluginId))];
    return ids
      .map((pluginId) => ({
        pluginId,
        name: getPlugin(pluginId)?.name ?? pluginId,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [detections]);

  const visibleDetections = useMemo(
    () =>
      selectedPluginId === "all"
        ? detections
        : detections.filter((detection) => detection.pluginId === selectedPluginId),
    [detections, selectedPluginId],
  );

  const sortedDetections = useMemo(
    () =>
      [...visibleDetections].sort((a, b) => {
        const aRecording = segmentMap.get(a.segmentId);
        const bRecording = segmentMap.get(b.segmentId);
        const aTime = aRecording
          ? new Date(aRecording.startedAt).getTime() + a.atSec * 1000
          : new Date(a.createdAt).getTime();
        const bTime = bRecording
          ? new Date(bRecording.startedAt).getTime() + b.atSec * 1000
          : new Date(b.createdAt).getTime();

        return aTime - bTime || a.frameIndex - b.frameIndex || a.id.localeCompare(b.id);
      }),
    [visibleDetections, segmentMap],
  );

  const selected = sortedDetections[selectedIdx] ?? null;
  const playbackActive = isPlaying && selectedIdx < sortedDetections.length - 1;

  // Compute wall-clock time for the selected detection
  const selectedTimestamp = useMemo(() => {
    if (!selected) return null;
    const rec = segmentMap.get(selected.segmentId);
    if (!rec) return null;
    return new Date(new Date(rec.startedAt).getTime() + selected.atSec * 1000);
  }, [selected, segmentMap]);

  const goPrev = useCallback(() => {
    setIsPlaying(false);
    setSelectedIdx((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setIsPlaying(false);
    setSelectedIdx((i) => Math.min(sortedDetections.length - 1, i + 1));
  }, [sortedDetections.length]);

  const togglePlay = useCallback(() => {
    if (sortedDetections.length <= 1) return;
    setIsPlaying((playing) => {
      const active = playing && selectedIdx < sortedDetections.length - 1;
      if (!active && selectedIdx >= sortedDetections.length - 1) {
        setSelectedIdx(0);
      }
      return !active;
    });
  }, [selectedIdx, sortedDetections.length]);

  useEffect(() => {
    if (!playbackActive) return;

    const timeout = window.setTimeout(() => {
      setSelectedIdx((i) => Math.min(sortedDetections.length - 1, i + 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [playbackActive, selectedIdx, sortedDetections.length]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    const thumbnail = selectedThumbnailRef.current;
    if (!viewport || !thumbnail) return;

    const centeredOffset = thumbnail.offsetLeft - (viewport.clientWidth - thumbnail.clientWidth) / 2;
    viewport.scrollLeft = Math.max(0, centeredOffset);
  }, [selectedIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    if (sortedDetections.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLButtonElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sortedDetections.length, goPrev, goNext, togglePlay]);

  const selectFromTimeline = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || sortedDetections.length === 0) return;
      const rect = timeline.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setIsPlaying(false);
      setSelectedIdx(Math.round(progress * (sortedDetections.length - 1)));
    },
    [sortedDetections.length],
  );

  const onTimelinePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      selectFromTimeline(event.clientX);
    },
    [selectFromTimeline],
  );

  const onTimelinePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        selectFromTimeline(event.clientX);
      }
    },
    [selectFromTimeline],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BrainCircuitIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">{error}</p>
      </div>
    );
  }

  if (detections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BrainCircuitIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">No detections available for this device.</p>
      </div>
    );
  }

  const progressPct = sortedDetections.length > 1 ? (selectedIdx / (sortedDetections.length - 1)) * 100 : 100;

  // Compute labels for the selected detection
  const selectedLabels = selected ? [...new Set(selected.detections.map((p) => p.label).filter(Boolean))] : [];
  const selectedPluginName =
    selectedPluginId === "all" ? "All plugins" : (getPlugin(selectedPluginId)?.name ?? selectedPluginId);

  return (
    <div className="flex h-full min-h-0 w-full max-w-[calc(100vw-2rem)] min-w-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border border-border bg-muted/20 px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-foreground/80">{selectedPluginName}</p>
          <p className="text-[9px] text-muted-foreground/50">
            {sortedDetections.length} detection frame{sortedDetections.length === 1 ? "" : "s"}
          </p>
        </div>
        {pluginOptions.length > 1 && (
          <Select
            onValueChange={(pluginId) => {
              const count =
                pluginId === "all"
                  ? detections.length
                  : detections.filter((detection) => detection.pluginId === pluginId).length;
              setSelectedPluginId(pluginId);
              setSelectedIdx(Math.max(0, count - 1));
              setIsPlaying(false);
            }}
            value={selectedPluginId}
          >
            <SelectTrigger aria-label="Detection plugin" className="h-8 w-56 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plugins</SelectItem>
              {pluginOptions.map((option) => (
                <SelectItem key={option.pluginId} value={option.pluginId}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ─ Image viewer ──────────────────────────────────────────────────── */}
      <div className="relative min-h-[160px] min-w-0 flex-1 overflow-hidden border border-border bg-muted/40">
        {selected && <DetectionFrame frame={selected} />}

        {/* Timestamp overlay */}
        {selectedTimestamp && (
          <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-none border border-border bg-background/80 px-2 py-1 font-mono text-[10px] text-foreground/70 tabular-nums backdrop-blur-sm">
            {formatWallClock(selectedTimestamp)}
          </div>
        )}

        {/* Nav arrows */}
        {sortedDetections.length > 1 && (
          <>
            <button
              aria-label="Previous detection"
              className="absolute top-1/2 left-2 z-10 flex size-8 -translate-y-1/2 items-center justify-center bg-background/80 backdrop-blur-sm transition-colors hover:bg-background/60 disabled:opacity-30"
              disabled={selectedIdx === 0}
              onClick={goPrev}
              type="button"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              aria-label="Next detection"
              className="absolute top-1/2 right-2 z-10 flex size-8 -translate-y-1/2 items-center justify-center bg-background/80 backdrop-blur-sm transition-colors hover:bg-background/60 disabled:opacity-30"
              disabled={selectedIdx === sortedDetections.length - 1}
              onClick={goNext}
              type="button"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        )}

        {/* Bottom info bar */}
        <div className="absolute right-0 bottom-0 left-0 z-10 flex items-center justify-between border-t border-border bg-background/80 px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              Frame {selected?.frameIndex}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
              {selected?.atSec.toFixed(1)}s into segment
            </span>
          </div>
          {selectedLabels.length > 0 && (
            <div className="flex items-center gap-1.5">
              {selectedLabels.map((label) => (
                <span className="rounded bg-lime-500/10 px-1.5 py-0.5 text-[9px] font-medium text-lime-600" key={label}>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─ Detection playback timeline ──────────────────────────────────── */}
      <div className="flex w-full max-w-[calc(100vw-2rem)] min-w-0 shrink-0 flex-col gap-2 overflow-hidden rounded-none border border-border bg-muted/20 p-2">
        <ScrollArea
          className="h-32 w-full max-w-[calc(100vw-3rem)] min-w-0 overflow-hidden"
          viewportRef={timelineViewportRef}
        >
          <div className="flex w-max min-w-full gap-1.5 pr-1 pb-3">
            {sortedDetections.map((pred, i) => {
              const isSelected = i === selectedIdx;
              const rec = segmentMap.get(pred.segmentId);
              const wallClock = rec ? new Date(new Date(rec.startedAt).getTime() + pred.atSec * 1000) : null;
              const count = pred.detections.length;

              return (
                <button
                  aria-label={`Show detection ${i + 1} of ${sortedDetections.length}`}
                  className={`flex w-36 shrink-0 flex-col items-center gap-1 rounded-none border border-border p-1.5 transition-colors ${
                    isSelected ? "bg-muted/40 ring-1 ring-foreground/20" : "bg-muted/10 hover:bg-muted/20"
                  }`}
                  key={pred.id}
                  onClick={() => {
                    setIsPlaying(false);
                    setSelectedIdx(i);
                  }}
                  ref={isSelected ? selectedThumbnailRef : undefined}
                  type="button"
                >
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    <img
                      alt={`Frame ${pred.frameIndex}`}
                      className="size-full object-contain"
                      decoding="async"
                      loading={isSelected ? "eager" : "lazy"}
                      src={`/assets/${encodeURIComponent(pred.assetId)}`}
                    />
                  </div>
                  <p className="font-mono text-[8px] text-muted-foreground/60 tabular-nums">
                    {wallClock ? formatWallClock(wallClock) : `${pred.atSec.toFixed(1)}s`}
                  </p>
                  <p className="font-mono text-[7px] text-muted-foreground/40">
                    {count} {count === 1 ? "det" : "dets"}
                  </p>
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="group relative flex items-center">
          <div
            aria-label="Detection timeline"
            aria-valuemax={sortedDetections.length}
            aria-valuemin={1}
            aria-valuenow={selectedIdx + 1}
            className="relative h-1.5 w-full cursor-pointer touch-none rounded-full bg-muted transition-colors group-hover:h-2"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") goPrev();
              if (event.key === "ArrowRight") goNext();
              if (event.key === "Home") {
                setIsPlaying(false);
                setSelectedIdx(0);
              }
              if (event.key === "End") {
                setIsPlaying(false);
                setSelectedIdx(sortedDetections.length - 1);
              }
            }}
            onPointerDown={onTimelinePointerDown}
            onPointerMove={onTimelinePointerMove}
            ref={timelineRef}
            role="slider"
            tabIndex={0}
          >
            {sortedDetections.map((_, i) => (
              <div
                className="absolute top-0 h-full w-px bg-foreground/15"
                key={i}
                style={{
                  left: `${sortedDetections.length > 1 ? (i / (sortedDetections.length - 1)) * 100 : 100}%`,
                }}
              />
            ))}
            <div
              className="absolute top-0 h-full rounded-full bg-foreground/60 transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              style={{ left: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            aria-label={playbackActive ? "Pause detection playback" : "Play detections"}
            className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            disabled={sortedDetections.length <= 1}
            onClick={togglePlay}
            type="button"
          >
            {playbackActive ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          </button>
          <button
            aria-label="Previous detection"
            className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            disabled={selectedIdx === 0}
            onClick={goPrev}
            type="button"
          >
            <SkipBackIcon className="size-3.5" />
          </button>
          <button
            aria-label="Next detection"
            className="flex size-7 items-center justify-center rounded-none text-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            disabled={selectedIdx === sortedDetections.length - 1}
            onClick={goNext}
            type="button"
          >
            <SkipForwardIcon className="size-3.5" />
          </button>
          <span className="ml-1 font-mono text-[10px] text-foreground/60 tabular-nums">
            {selectedIdx + 1} / {sortedDetections.length}
          </span>
          <div className="flex-1" />
          {selectedTimestamp && (
            <span className="mr-1 font-mono text-[9px] text-foreground/40 tabular-nums">
              {formatWallClock(selectedTimestamp)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
