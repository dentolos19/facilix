import { FilmIcon, Loader2Icon, VideoIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { DeviceDetail } from "#/lib/functions/facility";
import { getDeviceRecordings, type RecordingRow } from "#/lib/functions/recordings";

import { PlaybackPlayer } from "./playback-player";

export function CctvPlaybackTab({ device }: { device: DeviceDetail }) {
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getDeviceRecordings({ data: { facilityId: device.facilityId, deviceId: device.id } });
        if (!cancelled) setRecordings(rows);
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
        <VideoIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">{error}</p>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <FilmIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">No recordings available for this device.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlaybackPlayer className="h-full" recordings={recordings} />
    </div>
  );
}
