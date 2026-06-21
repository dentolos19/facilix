import { useEffect, useRef, useState } from "react";

import { getLatestSensorReading } from "#/lib/functions/sensors";

import type { PlacedItem } from "../-helpers/types";

export interface SensorReadingPanelProps {
  selectedDevice: PlacedItem;
  facilityId?: string;
}

type ReadingState = "idle" | "loading" | "ok" | "error";

/**
 * Live sensor reading display for a selected Sensor device.
 *
 * Reads the latest sensor reading from the app's database (populated by the
 * monitoring container's sensor polling) and polls at the configured interval.
 * Also shows real-time updates from Observer DO WebSocket events.
 */
export function SensorReadingPanel({ selectedDevice, facilityId }: SensorReadingPanelProps) {
  const { props } = selectedDevice;
  const dataSource = String(props.sensorDataSource ?? "simulation");
  const pollInterval = Number(props.pollInterval ?? 30) * 1000;
  const threshold = Number(props.threshold ?? 0);
  const unit = String(props.unit ?? "");

  // Use the actual facility device ID for D1 queries
  const deviceId = selectedDevice.id;

  const [reading, setReading] = useState<{
    value: number;
    unit: string;
    status: string;
    batteryPct: number | null;
    signalRssiDbm: number | null;
    secondaryValue: number | null;
    secondaryUnit: string | null;
    timestamp: Date | null;
  } | null>(null);
  const [state, setState] = useState<ReadingState>("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Clear any previous polling
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setReading(null);
    setState("idle");

    if (dataSource === "simulation" || dataSource === "http-pull") {
      if (!facilityId) {
        setState("idle");
        return;
      }

      const fetchReading = async () => {
        if (!mountedRef.current) return;
        setState("loading");
        try {
          const result = await getLatestSensorReading({ data: { facilityId, deviceId } });
          if (!mountedRef.current) return;
          if (result) {
            setReading(result);
            setState("ok");
          } else {
            setState("idle");
          }
        } catch {
          if (!mountedRef.current) return;
          setState("error");
        }
      };

      fetchReading();
      timerRef.current = setInterval(fetchReading, pollInterval);
    } else if (dataSource === "http-push") {
      // HTTP Push — no live fetch, just show placeholder
      setState("idle");
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [dataSource, facilityId, deviceId, pollInterval]);

  const isAlert = reading !== null && threshold > 0 && reading.value > threshold;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Live Reading
      </h4>

      {dataSource === "simulation" && !facilityId && (
        <div className="border-border bg-muted/40 flex items-center justify-center rounded-none border px-3 py-4">
          <span className="text-muted-foreground/50 text-[11px]">Select a sensor device in edit mode</span>
        </div>
      )}

      {(dataSource === "simulation" || dataSource === "http-pull") && facilityId && state === "loading" && (
        <div className="border-border bg-muted/40 flex items-center justify-center rounded-none border px-3 py-4">
          <div className="border-muted-foreground/30 border-t-muted-foreground size-4 animate-spin rounded-full border-2" />
          <span className="text-muted-foreground/60 ml-2 text-[11px]">Connecting…</span>
        </div>
      )}

      {(dataSource === "simulation" || dataSource === "http-pull") && facilityId && state === "error" && (
        <div className="border-border bg-muted/40 flex items-center justify-center rounded-none border px-3 py-4">
          <span className="text-muted-foreground/50 text-[11px]">Monitoring data unavailable</span>
        </div>
      )}

      {dataSource === "http-push" && (
        <div className="border-border bg-muted/40 flex items-center justify-center rounded-none border px-3 py-4">
          <span className="text-muted-foreground/50 text-[11px]">Waiting for device to push data</span>
        </div>
      )}

      {reading && state === "ok" && (
        <div className="border-border bg-muted/20 rounded-none border p-3">
          {/* Main value */}
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tabular-nums ${isAlert ? "text-red-500" : "text-foreground"}`}>
              {reading.value.toFixed(1)}
            </span>
            <span className="text-muted-foreground/70 text-[11px]">{unit || reading.unit}</span>
          </div>

          {/* Status badge */}
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={reading.status} />
            {isAlert && (
              <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                Threshold exceeded
              </span>
            )}
          </div>

          {/* Secondary value */}
          {reading.secondaryValue != null && (
            <p className="text-muted-foreground/60 mt-1.5 text-[11px]">
              Occupancy: <span className="text-foreground/80 tabular-nums">{reading.secondaryValue}</span>
              {reading.secondaryUnit ? ` ${reading.secondaryUnit}` : ""}
            </p>
          )}

          {/* Telemetry metadata */}
          <div className="text-muted-foreground/50 mt-2 flex gap-3 text-[10px]">
            <span>Battery: {reading.batteryPct?.toFixed(0) ?? "—"}%</span>
            <span>Signal: {reading.signalRssiDbm ?? "—"} dBm</span>
          </div>

          {/* Timestamp */}
          {reading.timestamp && (
            <p className="text-muted-foreground/40 mt-1 text-[10px]">{new Date(reading.timestamp).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ok: "bg-green-500/10 text-green-500",
    degraded: "bg-amber-500/10 text-amber-500",
    offline: "bg-red-500/10 text-red-500",
    error: "bg-red-500/10 text-red-500",
  };

  const labelMap: Record<string, string> = {
    ok: "Online",
    degraded: "Degraded",
    offline: "Offline",
    error: "Error",
  };

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colorMap[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {labelMap[status] ?? status}
    </span>
  );
}
