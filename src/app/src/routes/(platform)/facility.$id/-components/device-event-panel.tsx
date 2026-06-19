import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "#/components/ui/scroll-area";
import type { SensorReadingRow } from "#/lib/functions/sensors";
import { getLatestSensorReading } from "#/lib/functions/sensors";
import { getPlugin, normalizePlugins } from "#/lib/monitoring/plugins";
import { simulationHlsUrl } from "#/lib/simulation/cctv";
import type { LogEntry, PlacedItem } from "../-helpers/types";
import { CctvPlayer } from "./cctv-player";
import { LogLevelBadge } from "./monitoring-logs-panel";
import { SensorReadingPanel } from "./sensor-reading-panel";

const STATUS_STYLES: Record<string, { bg: string; dot: string }> = {
  online: { bg: "bg-green-500/10 text-green-600", dot: "bg-green-500" },
  degraded: { bg: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  error: { bg: "bg-red-500/10 text-red-600", dot: "bg-red-500" },
  offline: { bg: "bg-red-500/10 text-red-600", dot: "bg-red-500" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-[10px] uppercase ${style.bg}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

/**
 * Compact intelligence plugins section for CCTV devices in the monitoring panel.
 */
function CctvIntelligencePluginsSection({ device }: { device: PlacedItem }) {
  const configs = normalizePlugins(device.props.plugins);
  const installed = configs
    .map((c) => ({ config: c, plugin: getPlugin(c.pluginId) }))
    .filter(
      (entry): entry is { config: ReturnType<typeof normalizePlugins>[number]; plugin: NonNullable<ReturnType<typeof getPlugin>> } =>
        entry.plugin !== undefined,
    );

  if (installed.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
        Intelligence Plugins
      </h4>
      <div className="flex flex-col gap-1.5">
        {installed.map(({ config, plugin }) => {
          const kindLabels: string[] = [];
          if (plugin.kind === "object-anomaly") {
            const c = config as import("#/lib/monitoring/plugins").ObjectAnomalyDeviceConfig;
            kindLabels.push(...plugin.options.filter((o) => c.selectedAnomalies.includes(o.id)).map((o) => o.label));
          }
          if (plugin.kind === "object-counting") {
            const c = config as import("#/lib/monitoring/plugins").ObjectCountingDeviceConfig;
            kindLabels.push(...plugin.options.filter((o) => c.selectedSignals.includes(o.id)).map((o) => o.label));
          }

          return (
            <div className="flex items-center justify-between gap-2 rounded-none border border-border bg-muted/20 p-2" key={plugin.id}>
              <div className="flex min-w-0 items-center gap-1.5">
                <ShieldAlertIcon className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[11px] text-foreground/80">{plugin.name}</p>
                  {kindLabels.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {kindLabels.map((label) => (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] text-primary" key={label}>
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 font-medium text-[9px] ${
                  config.enabled
                    ? "bg-green-500/10 text-green-600"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {config.enabled ? "On" : "Off"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Device properties info row for use inside the monitoring panel.
 */
function PropRow({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground/60 text-[10px]">{label}</dt>
      <dd
        className={
          monospace
            ? "break-all text-right font-mono text-foreground/70 text-[10px]"
            : "break-words text-right text-foreground/70 text-[10px]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Renders the configuration properties for the selected device.
 */
function DevicePropertiesSection({ device }: { device: PlacedItem }) {
  const props = device.props;
  if (!props) return null;

  if (device.type === "CCTV") {
    const videoSource = String(props.videoSource ?? "simulation");
    const streamName = String(props.simulationStream ?? "");
    const streamUrl = String(props.streamUrl ?? "");
    const streamPath = String(props.streamPath ?? "");
    const deviceId = String(props.deviceId ?? "");
    const raw = props.capture;
    const capture: {
      frames?: { enabled?: boolean; intervalSec?: number };
      segments?: { enabled?: boolean; intervalSec?: number; durationSec?: number };
    } = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as typeof capture) : {};
    const frames = { enabled: true, intervalSec: 5, ...capture.frames };
    const segments = { enabled: true, intervalSec: 30, durationSec: 30, ...capture.segments };

    return (
      <div className="flex flex-col gap-2">
        <h4 className="font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          Properties
        </h4>
        <div className="rounded-none border border-border bg-muted/20 p-2">
          <dl className="flex flex-col gap-1.5">
            <PropRow label="Video Source" value={videoSource} />
            {streamName && videoSource === "simulation" && (
              <PropRow label="Simulation Stream" monospace value={streamName} />
            )}
            {streamUrl && videoSource !== "simulation" && <PropRow label="Stream URL" monospace value={streamUrl} />}
            {streamPath && <PropRow label="Stream Path" monospace value={streamPath} />}
            {deviceId && <PropRow label="Device ID" monospace value={deviceId} />}
            <PropRow label="Frame Capture" value={frames.enabled ? `Every ${frames.intervalSec ?? 5}s` : "Off"} />
            <PropRow
              label="Segment Capture"
              value={segments.enabled ? `Every ${segments.intervalSec ?? 30}s, ${segments.durationSec ?? 30}s` : "Off"}
            />
          </dl>
        </div>
      </div>
    );
  }

  if (device.type === "Sensor") {
    const sensorDataSource = String(props.sensorDataSource ?? "simulation");
    const sensorType = String(props.sensorType ?? "unknown");
    const simulationDeviceId = String(props.simulationDeviceId ?? "");
    const pullUrl = String(props.pullUrl ?? "");
    const pollInterval = String(props.pollInterval ?? "");
    const payloadFormat = String(props.payloadFormat ?? "facilix");
    const unit = String(props.unit ?? "");
    const threshold = String(props.threshold ?? "");

    return (
      <div className="flex flex-col gap-2">
        <h4 className="font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          Properties
        </h4>
        <div className="rounded-none border border-border bg-muted/20 p-2">
          <dl className="flex flex-col gap-1.5">
            <PropRow label="Sensor Type" value={sensorType} />
            <PropRow label="Data Source" value={sensorDataSource} />
            {sensorDataSource === "simulation" && simulationDeviceId && (
              <PropRow label="Simulation Device" monospace value={simulationDeviceId} />
            )}
            {sensorDataSource === "http-pull" && pullUrl && <PropRow label="Pull URL" monospace value={pullUrl} />}
            {threshold && unit && <PropRow label="Threshold" value={`${threshold}${unit}`} />}
            {pollInterval && <PropRow label="Poll Interval" value={`${pollInterval}s`} />}
            <PropRow label="Payload Format" value={payloadFormat} />
          </dl>
        </div>
      </div>
    );
  }

  return null;
}

/** Derive a device-level status string from a sensor reading. */
function deriveSensorDeviceStatus(reading: SensorReadingRow | null): string | null {
  if (!reading) return null;
  switch (reading.status) {
    case "ok":
      return "online";
    case "degraded":
      return "degraded";
    case "offline":
      return "offline";
    case "error":
      return "error";
    default:
      return reading.status;
  }
}

/** Individual log entries for a single selected device (monitoring right panel). */
export function DeviceEventPanel({
  logs,
  selectedDeviceId,
  selectedDevice,
  facilityId,
}: {
  logs: LogEntry[];
  selectedDeviceId: string | null;
  selectedDevice?: PlacedItem | null;
  facilityId?: string;
}) {
  const deviceEvents = useMemo(
    () => (selectedDeviceId ? logs.filter((l) => l.deviceId === selectedDeviceId) : []),
    [logs, selectedDeviceId],
  );

  const navigate = useNavigate();
  const isCCTV = selectedDevice?.type === "CCTV";
  const isSensor = selectedDevice?.type === "Sensor";

  // Fetch the latest sensor reading for sensor devices to determine real status
  const [sensorReading, setSensorReading] = useState<SensorReadingRow | null>(null);
  const [readingLoading, setReadingLoading] = useState(false);

  useEffect(() => {
    setSensorReading(null);
    if (!isSensor || !facilityId || !selectedDevice) return;

    let cancelled = false;
    setReadingLoading(true);

    getLatestSensorReading({ data: { facilityId, deviceId: selectedDevice.id } })
      .then((result) => {
        if (!cancelled) setSensorReading(result);
      })
      .catch(() => {
        // Sensor reading unavailable — keep existing status
      })
      .finally(() => {
        if (!cancelled) setReadingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSensor, facilityId, selectedDevice?.id]);

  // Derive the real device status
  const deviceStatus = isSensor
    ? (deriveSensorDeviceStatus(sensorReading) ?? selectedDevice?.status ?? "unknown")
    : (selectedDevice?.status ?? "unknown");

  // Derive HLS URL from selected CCTV device props
  const cctvHlsUrl = useMemo(() => {
    if (!selectedDevice || selectedDevice.type !== "CCTV") return null;
    const props = selectedDevice.props;
    const source = String(props.videoSource ?? "simulation");
    if (source === "simulation") {
      const streamName = String(props.simulationStream ?? "");
      return streamName ? simulationHlsUrl(streamName) : null;
    }
    // RTSP / RTMP — proxy not yet implemented; return null so placeholder shows.
    return null;
  }, [selectedDevice]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-4">
        <h3 className="shrink-0 font-heading font-medium text-muted-foreground text-xs uppercase tracking-wider">
          Device Details
        </h3>

        {!selectedDeviceId && (
          <div className="flex flex-1 items-center justify-center px-2 text-center">
            <span className="text-[11px] text-muted-foreground/50">
              Click an IoT device on the map to view its events
            </span>
          </div>
        )}

        {selectedDeviceId && deviceEvents.length === 0 && !selectedDevice && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[11px] text-muted-foreground/50">No events for this device</span>
          </div>
        )}

        {selectedDevice && (
          <div className="flex flex-col gap-2">
            {/* Device summary */}
            <div className="rounded-none border border-border bg-muted/20 p-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground text-xs">{selectedDevice.name}</p>
                  <p className="text-[11px] text-muted-foreground/70">Type: {selectedDevice.type}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground/70">Status:</span>
                    {readingLoading ? (
                      <span className="text-[10px] text-muted-foreground/50">Loading…</span>
                    ) : (
                      <StatusBadge status={deviceStatus} />
                    )}
                  </div>
                </div>
                <button
                  aria-label="View device details"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-foreground"
                  onClick={() => navigate({ to: "/device/$id", params: { id: selectedDevice.id } })}
                >
                  <ExternalLinkIcon className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Device properties */}
            <DevicePropertiesSection device={selectedDevice} />

            {/* Intelligence plugins (CCTV only) */}
            {isCCTV && <CctvIntelligencePluginsSection device={selectedDevice} />}

            {/* Video feed for CCTVs */}
            {isCCTV && (
              <div className="flex flex-col gap-2">
                <h4 className="font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                  Live Feed
                </h4>
                <CctvPlayer
                  hlsUrl={cctvHlsUrl}
                  streamName={
                    selectedDevice.type === "CCTV" ? String(selectedDevice.props.simulationStream ?? "") : undefined
                  }
                />
                {cctvHlsUrl && <p className="break-all text-[10px] text-muted-foreground/50">{cctvHlsUrl}</p>}
              </div>
            )}

            {/* Sensor readings */}
            {isSensor && selectedDevice && (
              <SensorReadingPanel facilityId={facilityId} selectedDevice={selectedDevice} />
            )}

            {/* Log entries (not applicable to zones) */}
            {selectedDevice.type !== "Zone" && (
              <div className="flex flex-col gap-2">
                <h4 className="font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                  Event History
                </h4>
                {deviceEvents.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {deviceEvents.map((log) => (
                      <div
                        className="flex flex-col gap-0.5 rounded-none border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed"
                        key={log.id}
                        style={{
                          borderLeftColor:
                            log.level === "error" ? "#ef4444" : log.level === "warn" ? "#f59e0b" : "#22c55e",
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          <LogLevelBadge level={log.level} />
                          <span className="text-muted-foreground/40">{log.timestamp.toLocaleTimeString()}</span>
                        </div>
                        <span className="text-foreground/80">{log.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground/50 leading-snug">
                    No events recorded for this device yet. Events appear here when the sensor triggers alerts or state
                    changes.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
