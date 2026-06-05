import { useEffect, useRef, useState } from "react";
import type { NormalizedReading } from "#/src/lib/simulation/sensors";
import { fetchSimulationLatestReading } from "#/src/lib/simulation/sensors";
import type { PlacedItem } from "../-helpers/types";

export interface SensorReadingPanelProps {
  selectedDevice: PlacedItem;
}

type ReadingState = "idle" | "loading" | "ok" | "error";

/**
 * Live sensor reading display for a selected Sensor device.
 *
 * Polls the simulation API (or external pull URL) at the configured
 * poll interval and shows the latest value, status, battery, and signal.
 */
export function SensorReadingPanel({ selectedDevice }: SensorReadingPanelProps) {
  const { props } = selectedDevice;
  const dataSource = String(props.sensorDataSource ?? "simulation");
  const simulationDeviceId = String(props.simulationDeviceId ?? "");
  const pollInterval = Number(props.pollInterval ?? 30) * 1000;
  const threshold = Number(props.threshold ?? 0);
  const unit = String(props.unit ?? "");

  const [reading, setReading] = useState<NormalizedReading | null>(null);
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

    if (dataSource === "simulation") {
      if (!simulationDeviceId) {
        setState("idle");
        return;
      }

      const fetchReading = async () => {
        if (!mountedRef.current) return;
        setState("loading");
        const result = await fetchSimulationLatestReading(simulationDeviceId);
        if (!mountedRef.current) return;
        if (result) {
          setReading(result);
          setState("ok");
        } else {
          setState("error");
        }
      };

      fetchReading();
      timerRef.current = setInterval(fetchReading, pollInterval);
    } else if (dataSource === "http-pull") {
      // HTTP Pull — not yet implemented beyond the API scaffolding
      setState("idle");
    } else {
      // HTTP Push — no live fetch, just show placeholder
      setState("idle");
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [dataSource, simulationDeviceId, pollInterval, props.deviceId]);

  const isAlert = reading !== null && threshold > 0 && reading.value > threshold;
  const isDegraded = reading?.status === "degraded" || reading?.status === "offline" || reading?.status === "error";

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Live Reading
      </h4>

      {dataSource === "simulation" && !simulationDeviceId && (
        <div className="flex items-center justify-center rounded-none border border-border bg-muted/40 px-3 py-4">
          <span className="text-[11px] text-muted-foreground/50">Select a simulation device in edit mode</span>
        </div>
      )}

      {dataSource === "simulation" && simulationDeviceId && state === "loading" && (
        <div className="flex items-center justify-center rounded-none border border-border bg-muted/40 px-3 py-4">
          <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          <span className="ml-2 text-[11px] text-muted-foreground/60">Connecting…</span>
        </div>
      )}

      {dataSource === "simulation" && simulationDeviceId && state === "error" && (
        <div className="flex items-center justify-center rounded-none border border-border bg-muted/40 px-3 py-4">
          <span className="text-[11px] text-muted-foreground/50">Simulator unreachable</span>
        </div>
      )}

      {dataSource === "http-pull" && (
        <div className="flex items-center justify-center rounded-none border border-border bg-muted/40 px-3 py-4">
          <span className="text-[11px] text-muted-foreground/50">HTTP Pull not yet implemented</span>
        </div>
      )}

      {dataSource === "http-push" && (
        <div className="flex items-center justify-center rounded-none border border-border bg-muted/40 px-3 py-4">
          <span className="text-[11px] text-muted-foreground/50">Waiting for device to push data</span>
        </div>
      )}

      {reading && state === "ok" && (
        <div className="rounded-none border border-border bg-muted/20 p-3">
          {/* Main value */}
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold tabular-nums ${isAlert ? "text-red-500" : "text-foreground"}`}>
              {reading.value.toFixed(1)}
            </span>
            <span className="text-[11px] text-muted-foreground/70">{unit || reading.unit}</span>
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
            <p className="mt-1.5 text-[11px] text-muted-foreground/60">
              Occupancy: <span className="text-foreground/80 tabular-nums">{reading.secondaryValue}</span>
              {reading.secondaryUnit ? ` ${reading.secondaryUnit}` : ""}
            </p>
          )}

          {/* Telemetry metadata */}
          <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground/50">
            <span>Battery: {reading.batteryPct.toFixed(0)}%</span>
            <span>Signal: {reading.signalRssiDbm} dBm</span>
            <span>Seq: {reading.sequence}</span>
          </div>

          {/* Timestamp */}
          {reading.timestamp && (
            <p className="mt-1 text-[10px] text-muted-foreground/40">{new Date(reading.timestamp).toLocaleString()}</p>
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
