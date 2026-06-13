import { PlayIcon, VideoIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RecordingAnomaly, RecordingRow } from "#/lib/functions/recordings";
import { cn } from "#/lib/utils";

interface PlaybackPlayerProps {
  recording: RecordingRow;
  className?: string;
}

type PlayerState = "idle" | "loading" | "playing" | "error";

export function PlaybackPlayer({ recording, className }: PlaybackPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<PlayerState>("idle");
  const [currentTime, setCurrentTime] = useState(0);

  const src = useMemo(() => `/api/assets/${encodeURIComponent(recording.assetId)}`, [recording.assetId]);

  const data = recording.data ?? {};
  const sceneSummary = data.sceneSummary ?? null;
  const anomalies = data.anomalies ?? [];
  const detectionCounts = data.detectionCounts ?? {};

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onWaiting = () => setState("loading");
    const onPlaying = () => setState("playing");
    const onError = () => setState("error");
    const onCanPlay = () => setState("playing");

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    video.addEventListener("canplay", onCanPlay);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, [src]);

  const activeAnomalies = useMemo(() => {
    return anomalies.filter((a) => currentTime >= a.atSec && currentTime < a.atSec + 2);
  }, [anomalies, currentTime]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-none border border-border bg-muted/40">
        <video
          className="size-full object-contain"
          controls
          crossOrigin="anonymous"
          onClick={togglePlay}
          playsInline
          preload="metadata"
          ref={videoRef}
          src={src}
        />

        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            <span className="text-[11px] text-muted-foreground/60">Loading video…</span>
          </div>
        )}

        {state === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/80">
            <VideoIcon className="size-6 text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground/50">Recording unavailable</span>
          </div>
        )}

        {/* Floating active-detection chips */}
        {activeAnomalies.length > 0 && (
          <div className="absolute top-2 left-2 z-10 flex max-w-[70%] flex-wrap gap-1">
            {activeAnomalies.map((a, i) => (
              <DetectionChip anomaly={a} key={`${a.label}-${a.atSec}-${i}`} />
            ))}
          </div>
        )}
      </div>

      {/* Analysis panel */}
      <div className="grid shrink-0 gap-3 lg:grid-cols-2">
        {sceneSummary && (
          <div className="rounded-none border border-border bg-muted/20 p-3">
            <h3 className="mb-1 font-heading font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
              Scene understanding
            </h3>
            <p className="text-[11px] text-foreground/80 leading-relaxed">{sceneSummary}</p>
          </div>
        )}

        <div className="rounded-none border border-border bg-muted/20 p-3">
          <h3 className="mb-2 font-heading font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
            Detections
          </h3>
          {Object.keys(detectionCounts).length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50">No detections for this segment.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(detectionCounts)
                .filter(([key]) => !key.startsWith("__"))
                .map(([label, count]) => (
                  <li
                    className="rounded-none border border-border bg-background px-2 py-1 text-[10px] text-foreground/80"
                    key={label}
                  >
                    {count}× {label}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Timeline of anomalies */}
      {anomalies.length > 0 && (
        <div className="shrink-0 rounded-none border border-border bg-muted/20 p-3">
          <h3 className="mb-2 font-heading font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
            Anomaly timeline
          </h3>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {anomalies.map((a, i) => (
              <button
                className={cn(
                  "shrink-0 rounded-none border px-2 py-1 text-left text-[10px] transition-colors",
                  currentTime >= a.atSec && currentTime < a.atSec + 2
                    ? "border-amber-500/50 bg-amber-500/10 text-amber-700"
                    : "border-border bg-background text-foreground/70 hover:bg-muted",
                )}
                key={`${a.label}-${a.atSec}-${i}`}
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.currentTime = a.atSec;
                }}
                type="button"
              >
                <span className="font-mono tabular-nums">{formatTime(a.atSec)}</span>
                <span className="ml-1.5">{a.label}</span>
                <span className="ml-1 text-muted-foreground/60">{Math.round(a.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetectionChip({ anomaly }: { anomaly: RecordingAnomaly }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-none border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700">
      <PlayIcon className="size-2.5 fill-current" />
      {anomaly.label} ({Math.round(anomaly.confidence * 100)}%)
    </span>
  );
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
