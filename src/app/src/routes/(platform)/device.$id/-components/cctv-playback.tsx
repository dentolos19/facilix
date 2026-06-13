import { FilmIcon, Loader2Icon, VideoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { DeviceDetail } from "#/src/lib/functions/facility";
import { getDeviceRecordings, type RecordingRow } from "#/src/lib/functions/recordings";
import { PlaybackPlayer } from "./playback-player";

export function CctvPlaybackTab({ device }: { device: DeviceDetail }) {
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getDeviceRecordings({ data: { facilityId: device.facilityId, deviceId: device.id } });
        if (!cancelled) {
          setRecordings(rows);
          setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load recordings");
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

  const selected = recordings.find((r) => r.id === selectedId) ?? recordings[0];

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
        <VideoIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">{error}</p>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <FilmIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">No recordings available for this device.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        {selected ? (
          <PlaybackPlayer className="h-full" recording={selected} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-none border border-border bg-muted/20">
            <p className="text-[11px] text-muted-foreground/50">Select a recording to play</p>
          </div>
        )}
      </div>

      {/* Recording list */}
      <div className="flex h-48 shrink-0 flex-col gap-2 lg:h-auto lg:w-72">
        <h3 className="shrink-0 font-heading text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Recordings
        </h3>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-none border border-border bg-muted/20 p-2">
          {recordings.map((r) => (
            <button
              className={`flex flex-col gap-1 rounded-none border p-2 text-left text-[10px] transition-colors ${
                selected?.id === r.id
                  ? "border-foreground/30 bg-background"
                  : "border-border bg-muted/30 hover:bg-muted"
              }`}
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              type="button"
            >
              <span className="font-medium text-foreground/80">{formatDate(r.createdAt)}</span>
              <span className="text-muted-foreground/60">
                {r.durationSec ? `${r.durationSec}s` : "Unknown duration"}
                {r.data?.sceneSummary ? " · AI summary" : ""}
              </span>
              {(r.data?.anomalies?.length ?? 0) > 0 && (
                <span className="mt-0.5 text-amber-600">{r.data?.anomalies?.length} anomalies</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
