import { BrainCircuitIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { DeviceDetail } from "#/lib/functions/facility";
import {
  getDevicePredictions,
  getDeviceRecordings,
  type PredictionOutputRow,
  type RecordingRow,
} from "#/lib/functions/recordings";

function formatWallClock(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function CctvPredictionsTab({ device }: { device: DeviceDetail }) {
  const [predictions, setPredictions] = useState<PredictionOutputRow[]>([]);
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

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
          setPredictions(preds);
          setRecordings(recs);
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

  const selected = predictions[selectedIdx] ?? null;

  // Compute wall-clock time for the selected prediction
  const selectedTimestamp = useMemo(() => {
    if (!selected) return null;
    const rec = segmentMap.get(selected.segmentId);
    if (!rec) return null;
    return new Date(new Date(rec.startedAt).getTime() + selected.atSec * 1000);
  }, [selected, segmentMap]);

  const goPrev = useCallback(() => {
    setSelectedIdx((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setSelectedIdx((i) => Math.min(predictions.length - 1, i + 1));
  }, [predictions.length]);

  // Keyboard shortcuts
  useEffect(() => {
    if (predictions.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [predictions.length, goPrev, goNext]);

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

  // Compute labels for the selected prediction
  const selectedLabels = selected ? [...new Set(selected.predictions.map((p) => p.label).filter(Boolean))] : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
      {/* ─ Image viewer ──────────────────────────────────────────────────── */}
      <div className="border-border bg-muted/40 relative min-h-[160px] min-w-0 flex-1 overflow-hidden border">
        {selected && (
          <img
            alt={`Prediction frame ${selected.frameIndex}`}
            className="h-full w-full object-contain"
            src={`/assets/${encodeURIComponent(selected.afterAssetId)}`}
          />
        )}

        {/* Timestamp overlay */}
        {selectedTimestamp && (
          <div className="border-border bg-background/80 text-foreground/70 pointer-events-none absolute top-2 left-2 z-10 rounded-none border px-2 py-1 font-mono text-[10px] tabular-nums backdrop-blur-sm">
            {formatWallClock(selectedTimestamp)}
          </div>
        )}

        {/* Nav arrows */}
        {predictions.length > 1 && (
          <>
            <button
              className="bg-background/80 hover:bg-background/60 absolute top-1/2 left-2 z-10 flex size-8 -translate-y-1/2 items-center justify-center backdrop-blur-sm transition-colors disabled:opacity-30"
              disabled={selectedIdx === 0}
              onClick={goPrev}
              type="button"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              className="bg-background/80 hover:bg-background/60 absolute top-1/2 right-2 z-10 flex size-8 -translate-y-1/2 items-center justify-center backdrop-blur-sm transition-colors disabled:opacity-30"
              disabled={selectedIdx === predictions.length - 1}
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

      {/* ─ Horizontal filmstrip timeline ──────────────────────────────────── */}
      <div className="border-border bg-muted/20 w-full min-w-0 shrink-0 overflow-hidden rounded-none border p-2">
        <div className="flex w-full max-w-[calc(100vw-3rem)] min-w-0 gap-1.5 overflow-x-auto pb-1">
          {predictions.map((pred, i) => {
            const isSelected = i === selectedIdx;
            const rec = segmentMap.get(pred.segmentId);
            const wallClock = rec ? new Date(new Date(rec.startedAt).getTime() + pred.atSec * 1000) : null;
            const count = pred.predictions.length;

            return (
              <button
                className={`border-border flex shrink-0 flex-col items-center gap-1 rounded-none border p-1.5 transition-colors ${
                  isSelected ? "bg-muted/40 ring-foreground/20 ring-1" : "bg-muted/10 hover:bg-muted/20"
                }`}
                key={pred.id}
                onClick={() => setSelectedIdx(i)}
                type="button"
              >
                <div className="bg-muted size-16 overflow-hidden">
                  <img
                    alt={`Frame ${pred.frameIndex}`}
                    className="size-full object-contain"
                    src={`/assets/${encodeURIComponent(pred.afterAssetId)}`}
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
      </div>
    </div>
  );
}
