import {
  AlertTriangleIcon,
  ChevronDownIcon,
  FileTextIcon,
  InfoIcon,
  Loader2Icon,
  OctagonAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { FacilityEventView } from "#/lib/functions/events";
import { getFacilityEvents } from "#/lib/functions/events";

export function FacilityLogsTab({ facilityId }: { facilityId: string }) {
  const [events, setEvents] = useState<FacilityEventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getFacilityEvents({
          data: { facilityId, limit: 200 },
        });
        if (!cancelled) setEvents(rows as FacilityEventView[]);
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
  }, [facilityId]);

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
        <FileTextIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <FileTextIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">No logs for this facility yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
          Recent events
        </h3>
        <span className="text-muted-foreground/50 text-[10px]">{events.length} shown</span>
      </div>
      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <LogRow event={event} key={event.id} />
        ))}
      </div>
    </div>
  );
}

function LogRow({ event }: { event: FacilityEventView }) {
  const Icon = SEVERITY_ICONS[event.severity] ?? InfoIcon;
  const color = SEVERITY_COLORS[event.severity] ?? "text-muted-foreground";
  const [expanded, setExpanded] = useState(false);

  const dataKeys = Object.entries(event.data).filter(([, v]) => v != null);
  const hasData = dataKeys.length > 0;

  return (
    <button
      className="border-border bg-background hover:bg-muted/30 flex gap-3 rounded-none border p-2.5 text-left transition-colors"
      onClick={() => hasData && setExpanded(!expanded)}
      type="button"
    >
      <div className="mt-0.5 shrink-0">
        <Icon className={`size-3.5 ${color}`} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-foreground/80 truncate text-[11px] font-medium">{event.type}</span>
            <span className="text-muted-foreground/50 shrink-0 text-[10px]">{event.deviceName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-muted-foreground/50 text-[10px] tabular-nums">
              {new Date(event.createdAt).toLocaleString()}
            </span>
            {hasData && (
              <ChevronDownIcon
                className={`text-muted-foreground/40 size-3 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            )}
          </div>
        </div>
        <p className="text-foreground/70 text-[11px]">{event.message}</p>
        {hasData && expanded && (
          <dl className="bg-muted/30 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-none p-1.5 text-[10px]">
            {dataKeys.map(([key, value]) => (
              <DataField key={key} keyName={key} value={value} />
            ))}
          </dl>
        )}
      </div>
    </button>
  );
}

function DataField({ keyName, value }: { keyName: string; value: unknown }) {
  const label = KNOWN_KEYS[keyName] ?? formatKey(keyName);

  if (value === undefined || value === null) return null;

  if (typeof value === "object") {
    const str = JSON.stringify(value);
    const isLargeArray = Array.isArray(value) && value.length > 3;
    return (
      <>
        <dt className="text-muted-foreground/60">{label}</dt>
        <dd className="text-foreground/70 truncate font-mono">{isLargeArray ? `${value.length} items` : str}</dd>
      </>
    );
  }

  const display = formatValue(keyName, value);
  return (
    <>
      <dt className="text-muted-foreground/60">{label}</dt>
      <dd className="text-foreground/70 truncate font-mono">{display}</dd>
    </>
  );
}

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(key: string, value: unknown): string {
  if (typeof value === "number") {
    if (key === "sizeBytes") return formatBytes(value);
    if (key === "durationSec") return formatDuration(value);
    if (key === "confidence") return `${(value * 100).toFixed(1)}%`;
    if (key === "batteryPct") return `${value.toFixed(0)}%`;
    if (key === "signalRssiDbm") return `${value} dBm`;
    return key.includes("Id") || key === "segmentId" || key === "assetId"
      ? String(value).slice(0, 12) + (String(value).length > 12 ? "..." : "")
      : String(
          key.includes("Count")
            ? value
            : typeof value === "number" && !Number.isInteger(value)
              ? value.toFixed(2)
              : value,
        );
  }

  if (typeof value === "string") {
    if (key === "timestamp") return new Date(value).toLocaleString();
    if (value.length > 80) return value.slice(0, 80) + "...";
    return value;
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  return String(value);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(1)} ${units[Math.min(i, units.length - 1)]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
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

const KNOWN_KEYS: Record<string, string> = {
  source: "Source",
  sensorType: "Sensor",
  value: "Value",
  unit: "Unit",
  status: "Status",
  secondaryValue: "Secondary",
  secondaryUnit: "Secondary Unit",
  batteryPct: "Battery",
  signalRssiDbm: "Signal",
  timestamp: "Timestamp",
  durationSec: "Duration",
  sizeBytes: "Size",
  content: "Content",
  assetId: "Asset",
  segmentId: "Segment",
  detectionCount: "Detections",
  anomalyCount: "Anomalies",
  alertCount: "Alerts",
  sceneSummary: "Summary",
  pluginId: "Plugin",
  pluginName: "Plugin",
  category: "Category",
  alertKind: "Alert Kind",
  description: "Description",
  reason: "Reason",
  recommendedAction: "Action",
  count: "Count",
  threshold: "Threshold",
  operator: "Operator",
  thresholdMode: "Threshold Mode",
  matchedLabels: "Matched Labels",
  confidence: "Confidence",
  detectionCounts: "Detection Counts",
  level: "Level",
  facilityId: "Facility",
};
