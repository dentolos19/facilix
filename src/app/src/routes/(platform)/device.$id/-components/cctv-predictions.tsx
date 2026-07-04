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

import { ScrollArea, ScrollBar } from "#/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import type { DeviceDetail } from "#/lib/functions/facility";
import {
  getDevicePredictions,
  getDeviceRecordings,
  type PredictionOutputRow,
  type RecordingDetection,
  type RecordingRow,
} from "#/lib/functions/recordings";
import { getPlugin } from "#/lib/monitoring/plugins";

function formatWallClock(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getDetectionRect(detection: RecordingDetection) {
  if (detection.box) {
    return {
      x: detection.box.xmin,
      y: detection.box.ymin,
      width: detection.box.xmax - detection.box.xmin,
      height: detection.box.ymax - detection.box.ymin,
    };
  }
  if (detection.prediction) {
    return {
      x: detection.prediction.x - detection.prediction.width / 2,
      y: detection.prediction.y - detection.prediction.height / 2,
      width: detection.prediction.width,
      height: detection.prediction.height,
    };
  }
  return null;
}

function PredictionFrame({ prediction }: { prediction: PredictionOutputRow }) {
  const { width, height } = prediction.image;
  const strokeWidth = Math.max(2, Math.max(width, height) * 0.003);

  return (
    <div className="relative size-full">
      <img
        alt={`Prediction frame ${prediction.frameIndex}`}
        className="size-full object-contain"
        src={`/assets/${encodeURIComponent(prediction.beforeAssetId)}`}
      />
      {width > 0 && height > 0 && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${width} ${height}`}
        >
          {prediction.predictions.map((detection, index) => {
            const rect = getDetectionRect(detection);
            if (!rect) return null;
            const labelY = Math.max(12, rect.y - 5);
            return (
              <g key={`${detection.label}-${detection.frameIndex ?? prediction.frameIndex}-${index}`}>
                <rect
                  fill="transparent"
                  height={rect.height}
                  stroke="#84cc16"
                  strokeWidth={strokeWidth}
                  width={rect.width}
                  x={rect.x}
                  y={rect.y}
                />
                <text
                  fill="#84cc16"
                  fontFamily="monospace"
                  fontSize={Math.max(12, height * 0.025)}
                  fontWeight="700"
                  paintOrder="stroke"
                  stroke="rgba(0,0,0,0.8)"
                  strokeWidth={strokeWidth}
                  x={rect.x}
                  y={labelY}
                >
                  {detection.label} {Math.round(detection.confidence * 100)}%
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function CctvPredictionsTab({ device }: { device: DeviceDetail }) {
  const [predictions, setPredictions] = useState<PredictionOutputRow[]>([]);
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
          getDevicePredictions({
            data: { facilityId: device.facilityId, deviceId: device.id },
          }),
          getDeviceRecordings({
            data: { facilityId: device.facilityId, deviceId: device.id },
          }),
        ]);
        if (!cancelled) {
          const firstPluginId = preds[0]?.pluginId ?? "all";
          const pluginPredictionCount = preds.filter((prediction) => prediction.pluginId === firstPluginId).length;
          setPredictions(preds);
          setRecordings(recs);
          setSelectedPluginId(firstPluginId);
          setSelectedIdx(Math.max(0, pluginPredictionCount - 1));
          setIsPlaying(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load predictions");
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
    const ids = [...new Set(predictions.map((prediction) => prediction.pluginId))];
    return ids
      .map((pluginId) => ({
        pluginId,
        name: getPlugin(pluginId)?.name ?? pluginId,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [predictions]);

  const visiblePredictions = useMemo(
    () =>
      selectedPluginId === "all"
        ? predictions
        : predictions.filter((prediction) => prediction.pluginId === selectedPluginId),
    [predictions, selectedPluginId],
  );

  const sortedPredictions = useMemo(
    () =>
      [...visiblePredictions].sort((a, b) => {
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
    [visiblePredictions, segmentMap],
  );

  const selected = sortedPredictions[selectedIdx] ?? null;

  // Compute wall-clock time for the selected prediction
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
    setSelectedIdx((i) => Math.min(sortedPredictions.length - 1, i + 1));
  }, [sortedPredictions.length]);

  const togglePlay = useCallback(() => {
    if (sortedPredictions.length <= 1) return;
    setIsPlaying((playing) => {
      if (!playing && selectedIdx >= sortedPredictions.length - 1) {
        setSelectedIdx(0);
      }
      return !playing;
    });
  }, [selectedIdx, sortedPredictions.length]);

  useEffect(() => {
    if (!isPlaying) return;
    if (selectedIdx >= sortedPredictions.length - 1) {
      setIsPlaying(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setSelectedIdx((i) => Math.min(sortedPredictions.length - 1, i + 1));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [isPlaying, selectedIdx, sortedPredictions.length]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    const thumbnail = selectedThumbnailRef.current;
    if (!viewport || !thumbnail) return;

    const centeredOffset = thumbnail.offsetLeft - (viewport.clientWidth - thumbnail.clientWidth) / 2;
    viewport.scrollLeft = Math.max(0, centeredOffset);
  }, [selectedIdx]);

  // Keyboard shortcuts
  useEffect(() => {
    if (sortedPredictions.length === 0) return;
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
  }, [sortedPredictions.length, goPrev, goNext, togglePlay]);

  const selectFromTimeline = useCallback(
    (clientX: number) => {
      const timeline = timelineRef.current;
      if (!timeline || sortedPredictions.length === 0) return;
      const rect = timeline.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setIsPlaying(false);
      setSelectedIdx(Math.round(progress * (sortedPredictions.length - 1)));
    },
    [sortedPredictions.length],
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
        <Loader2Icon className="text-muted-foreground/50 size-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BrainCircuitIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">{error}</p>
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BrainCircuitIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">No predictions available for this device.</p>
      </div>
    );
  }

  const progressPct = sortedPredictions.length > 1 ? (selectedIdx / (sortedPredictions.length - 1)) * 100 : 100;

  // Compute labels for the selected prediction
  const selectedLabels = selected ? [...new Set(selected.predictions.map((p) => p.label).filter(Boolean))] : [];
  const selectedPluginName =
    selectedPluginId === "all" ? "All plugins" : (getPlugin(selectedPluginId)?.name ?? selectedPluginId);

  return (
    <div className="flex h-full min-h-0 w-full max-w-[calc(100vw-2rem)] min-w-0 flex-col gap-3 overflow-hidden">
      <div className="border-border bg-muted/20 flex shrink-0 items-center justify-between gap-3 border px-3 py-2">
        <div className="min-w-0">
          <p className="text-foreground/80 text-[11px] font-medium">{selectedPluginName}</p>
          <p className="text-muted-foreground/50 text-[9px]">
            {sortedPredictions.length} prediction frame{sortedPredictions.length === 1 ? "" : "s"}
          </p>
        </div>
        {pluginOptions.length > 1 && (
          <Select
            onValueChange={(pluginId) => {
              const count =
                pluginId === "all"
                  ? predictions.length
                  : predictions.filter((prediction) => prediction.pluginId === pluginId).length;
              setSelectedPluginId(pluginId);
              setSelectedIdx(Math.max(0, count - 1));
              setIsPlaying(false);
            }}
            value={selectedPluginId}
          >
            <SelectTrigger aria-label="Prediction plugin" className="h-8 w-56 text-[10px]">
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
      <div className="border-border bg-muted/40 relative min-h-[160px] min-w-0 flex-1 overflow-hidden border">
        {selected && <PredictionFrame prediction={selected} />}

        {/* Timestamp overlay */}
        {selectedTimestamp && (
          <div className="border-border bg-background/80 text-foreground/70 pointer-events-none absolute top-2 left-2 z-10 rounded-none border px-2 py-1 font-mono text-[10px] tabular-nums backdrop-blur-sm">
            {formatWallClock(selectedTimestamp)}
          </div>
        )}

        {/* Nav arrows */}
        {sortedPredictions.length > 1 && (
          <>
            <button
              aria-label="Previous prediction"
              className="bg-background/80 hover:bg-background/60 absolute top-1/2 left-2 z-10 flex size-8 -translate-y-1/2 items-center justify-center backdrop-blur-sm transition-colors disabled:opacity-30"
              disabled={selectedIdx === 0}
              onClick={goPrev}
              type="button"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              aria-label="Next prediction"
              className="bg-background/80 hover:bg-background/60 absolute top-1/2 right-2 z-10 flex size-8 -translate-y-1/2 items-center justify-center backdrop-blur-sm transition-colors disabled:opacity-30"
              disabled={selectedIdx === sortedPredictions.length - 1}
              onClick={goNext}
              type="button"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </>
        )}

        {/* Bottom info bar */}
        <div className="border-border bg-background/80 absolute right-0 bottom-0 left-0 z-10 flex items-center justify-between border-t px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
              Frame {selected?.frameIndex}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
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

      {/* ─ Prediction playback timeline ──────────────────────────────────── */}
      <div className="border-border bg-muted/20 flex w-full max-w-[calc(100vw-2rem)] min-w-0 shrink-0 flex-col gap-2 overflow-hidden rounded-none border p-2">
        <ScrollArea
          className="h-32 w-full max-w-[calc(100vw-3rem)] min-w-0 overflow-hidden"
          viewportRef={timelineViewportRef}
        >
          <div className="flex w-max min-w-full gap-1.5 pr-1 pb-3">
            {sortedPredictions.map((pred, i) => {
              const isSelected = i === selectedIdx;
              const rec = segmentMap.get(pred.segmentId);
              const wallClock = rec ? new Date(new Date(rec.startedAt).getTime() + pred.atSec * 1000) : null;
              const count = pred.predictions.length;

              return (
                <button
                  aria-label={`Show prediction ${i + 1} of ${sortedPredictions.length}`}
                  className={`border-border flex w-36 shrink-0 flex-col items-center gap-1 rounded-none border p-1.5 transition-colors ${
                    isSelected ? "bg-muted/40 ring-foreground/20 ring-1" : "bg-muted/10 hover:bg-muted/20"
                  }`}
                  key={pred.id}
                  onClick={() => {
                    setIsPlaying(false);
                    setSelectedIdx(i);
                  }}
                  ref={isSelected ? selectedThumbnailRef : undefined}
                  type="button"
                >
                  <div className="bg-muted aspect-video w-full overflow-hidden">
                    <img
                      alt={`Frame ${pred.frameIndex}`}
                      className="size-full object-contain"
                      decoding="async"
                      loading={isSelected ? "eager" : "lazy"}
                      src={`/assets/${encodeURIComponent(pred.beforeAssetId)}`}
                    />
                  </div>
                  <p className="text-muted-foreground/60 font-mono text-[8px] tabular-nums">
                    {wallClock ? formatWallClock(wallClock) : `${pred.atSec.toFixed(1)}s`}
                  </p>
                  <p className="text-muted-foreground/40 font-mono text-[7px]">
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
            aria-label="Prediction timeline"
            aria-valuemax={sortedPredictions.length}
            aria-valuemin={1}
            aria-valuenow={selectedIdx + 1}
            className="bg-muted relative h-1.5 w-full cursor-pointer touch-none rounded-full transition-colors group-hover:h-2"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") goPrev();
              if (event.key === "ArrowRight") goNext();
              if (event.key === "Home") {
                setIsPlaying(false);
                setSelectedIdx(0);
              }
              if (event.key === "End") {
                setIsPlaying(false);
                setSelectedIdx(sortedPredictions.length - 1);
              }
            }}
            onPointerDown={onTimelinePointerDown}
            onPointerMove={onTimelinePointerMove}
            ref={timelineRef}
            role="slider"
            tabIndex={0}
          >
            {sortedPredictions.map((prediction, i) => (
              <div
                className="bg-foreground/15 absolute top-0 h-full w-px"
                key={prediction.id}
                style={{
                  left: `${sortedPredictions.length > 1 ? (i / (sortedPredictions.length - 1)) * 100 : 100}%`,
                }}
              />
            ))}
            <div
              className="bg-foreground/60 absolute top-0 h-full rounded-full transition-[width] duration-75"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="bg-foreground absolute top-1/2 z-20 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            aria-label={isPlaying ? "Pause prediction playback" : "Play predictions"}
            className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors disabled:opacity-30"
            disabled={sortedPredictions.length <= 1}
            onClick={togglePlay}
            type="button"
          >
            {isPlaying ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          </button>
          <button
            aria-label="Previous prediction"
            className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors disabled:opacity-30"
            disabled={selectedIdx === 0}
            onClick={goPrev}
            type="button"
          >
            <SkipBackIcon className="size-3.5" />
          </button>
          <button
            aria-label="Next prediction"
            className="text-foreground/70 hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-none transition-colors disabled:opacity-30"
            disabled={selectedIdx === sortedPredictions.length - 1}
            onClick={goNext}
            type="button"
          >
            <SkipForwardIcon className="size-3.5" />
          </button>
          <span className="text-foreground/60 ml-1 font-mono text-[10px] tabular-nums">
            {selectedIdx + 1} / {sortedPredictions.length}
          </span>
          <div className="flex-1" />
          {selectedTimestamp && (
            <span className="text-foreground/40 mr-1 font-mono text-[9px] tabular-nums">
              {formatWallClock(selectedTimestamp)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
