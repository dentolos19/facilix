import { AlertTriangleIcon, FileTextIcon, InfoIcon, Loader2Icon, OctagonAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { type FacilityEventRow, getDeviceEvents } from "#/src/lib/functions/events";
import type { DeviceDetail } from "#/src/lib/functions/facility";

export function DeviceLogsTab({ device }: { device: DeviceDetail }) {
  const [events, setEvents] = useState<FacilityEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getDeviceEvents({
          data: { facilityId: device.facilityId, deviceId: device.id, limit: 200 },
        });
        if (!cancelled) setEvents(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load logs");
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
        <Loader2Icon className="size-5 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <FileTextIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <FileTextIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">No logs for this device yet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Recent events
        </h3>
        <span className="text-[10px] text-muted-foreground/50">{events.length} shown</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-none border border-border bg-muted/20 p-3">
        {events.map((event) => (
          <EventRow event={event} key={event.id} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: FacilityEventRow }) {
  const Icon = SEVERITY_ICONS[event.severity] ?? InfoIcon;
  const color = SEVERITY_COLORS[event.severity] ?? "text-muted-foreground";

  return (
    <div className="flex gap-3 rounded-none border border-border bg-background p-2.5">
      <div className="mt-0.5 shrink-0">
        <Icon className={`size-3.5 ${color}`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-foreground/80">{event.type}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
            {new Date(event.createdAt).toLocaleString()}
          </span>
        </div>
        <p className="text-[11px] text-foreground/70">{event.message}</p>
        {event.data && event.data !== "{}" && (
          <pre className="mt-1 overflow-x-auto rounded-none bg-muted/30 p-1.5 text-[10px] text-muted-foreground/70">
            {event.data}
          </pre>
        )}
      </div>
    </div>
  );
}

const SEVERITY_ICONS = {
  info: InfoIcon,
  warn: AlertTriangleIcon,
  error: OctagonAlertIcon,
} satisfies Record<string, React.ComponentType<{ className?: string }>>;

const SEVERITY_COLORS = {
  info: "text-blue-500",
  warn: "text-amber-500",
  error: "text-red-500",
};
