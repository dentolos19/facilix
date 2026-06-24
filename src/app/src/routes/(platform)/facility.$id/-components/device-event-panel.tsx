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
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style.bg}`}
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
      (
        entry,
      ): entry is {
        config: ReturnType<typeof normalizePlugins>[number];
        plugin: NonNullable<ReturnType<typeof getPlugin>>;
      } => entry.plugin !== undefined,
    );

  if (installed.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
        Intelligence Plugins
      </h4>
      <div className="flex flex-col gap-1.5">
        {installed.map(({ config, plugin }) => {
          const isDetection = plugin.kind === "workflow-object-detection";
          const detConfig = isDetection
            ? (config as import("#/lib/monitoring/plugins").WorkflowObjectDetectionDeviceConfig)
            : null;

          return (
            <div
              className="border-border bg-muted/20 flex items-center justify-between gap-2 rounded-none border p-2"
              key={plugin.id}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <ShieldAlertIcon className="text-muted-foreground/60 mt-0.5 size-3 shrink-0" />
                <div className="min-w-0">
                  <p className="text-foreground/80 truncate text-[11px] font-medium">{plugin.name}</p>
                  {isDetection && detConfig && (
                    <p className="text-muted-foreground/60 text-[9px]">
                      {(detConfig.alerts?.length ?? 0) > 0
                        ? `${detConfig.alerts.length} alert rule(s)`
                        : "No alerts configured"}
                    </p>
                  )}
                  {!isDetection && (
                    <p className="text-muted-foreground/60 text-[9px]">
                      {(() => {
                        const segConfig = config as import("#/lib/monitoring/plugins").SegmentAnalysisDeviceConfig;
                        return (segConfig.alerts?.length ?? 0) > 0
                          ? `${segConfig.alerts.length} scene alert(s)`
                          : "Using base prompt";
                      })()}
                    </p>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                  config.enabled ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
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
      <dt className="text-muted-foreground/60 shrink-0 text-[10px]">{label}</dt>
      <dd
        className={
          monospace
            ? "text-foreground/70 text-right font-mono text-[10px] break-all"
            : "text-foreground/70 text-right text-[10px] break-words"
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
      segments?: { enabled?: boolean; intervalSec?: number; durationSec?: number };
    } = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as typeof capture) : {};
    const segments = { enabled: true, intervalSec: 30, durationSec: 30, ...capture.segments };

    return (
      <div className="flex flex-col gap-2">
        <h4 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Properties
        </h4>
        <div className="border-border bg-muted/20 rounded-none border p-2">
          <dl className="flex flex-col gap-1.5">
            <PropRow label="Video Source" value={videoSource} />
            {streamName && videoSource === "simulation" && (
              <PropRow label="Simulation Stream" monospace value={streamName} />
            )}
            {streamUrl && videoSource !== "simulation" && <PropRow label="Stream URL" monospace value={streamUrl} />}
            {streamPath && <PropRow label="Stream Path" monospace value={streamPath} />}
            {deviceId && <PropRow label="Device ID" monospace value={deviceId} />}
            <PropRow label="Segment Duration" value={segments.enabled ? `${segments.durationSec ?? 30}s` : "Off"} />
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
        <h4 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Properties
        </h4>
        <div className="border-border bg-muted/20 rounded-none border p-2">
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
  }, [isSensor, facilityId, selectedDevice]);

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
        <h3 className="font-heading text-muted-foreground shrink-0 text-xs font-medium tracking-wider uppercase">
          Device Details
        </h3>

        {!selectedDeviceId && (
          <div className="flex flex-1 items-center justify-center px-2 text-center">
            <span className="text-muted-foreground/50 text-[11px]">
              Click an IoT device on the map to view its events
            </span>
          </div>
        )}

        {selectedDeviceId && deviceEvents.length === 0 && !selectedDevice && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-muted-foreground/50 text-[11px]">No events for this device</span>
          </div>
        )}

        {selectedDevice && (
          <div className="flex flex-col gap-2">
            {/* Device summary */}
            <div className="border-border bg-muted/20 rounded-none border p-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-foreground text-xs font-medium">{selectedDevice.name}</p>
                  <p className="text-muted-foreground/70 text-[11px]">Type: {selectedDevice.type}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-muted-foreground/70 text-[11px]">Status:</span>
                    {readingLoading ? (
                      <span className="text-muted-foreground/50 text-[10px]">Loading…</span>
                    ) : (
                      <StatusBadge status={deviceStatus} />
                    )}
                  </div>
                </div>
                <button
                  aria-label="View device details"
                  className="text-muted-foreground/50 hover:bg-muted/40 hover:text-foreground flex size-6 items-center justify-center rounded transition-colors"
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
                <h4 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                  Live Feed
                </h4>
                <CctvPlayer
                  hlsUrl={cctvHlsUrl}
                  streamName={
                    selectedDevice.type === "CCTV" ? String(selectedDevice.props.simulationStream ?? "") : undefined
                  }
                />
                {cctvHlsUrl && <p className="text-muted-foreground/50 text-[10px] break-all">{cctvHlsUrl}</p>}
              </div>
            )}

            {/* Sensor readings */}
            {isSensor && selectedDevice && (
              <SensorReadingPanel facilityId={facilityId} selectedDevice={selectedDevice} />
            )}

            {/* Log entries (not applicable to zones) */}
            {selectedDevice.type !== "Zone" && (
              <div className="flex flex-col gap-2">
                <h4 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
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
                  <p className="text-muted-foreground/50 text-[11px] leading-snug">
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
