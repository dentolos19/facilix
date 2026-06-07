import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ScrollArea } from "#/src/components/ui/scroll-area";
import { getLatestSensorReading } from "#/src/lib/functions/sensors";
import type { SensorReadingRow } from "#/src/lib/functions/sensors";
import { simulationHlsUrl } from "#/src/lib/simulation/cctv";
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
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style.bg}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
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
    ? deriveSensorDeviceStatus(sensorReading) ?? selectedDevice?.status ?? "unknown"
    : selectedDevice?.status ?? "unknown";

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
        <h3 className="shrink-0 font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
                  <p className="text-xs font-medium text-foreground">{selectedDevice.name}</p>
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
                  className="flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
                  onClick={() => navigate({ to: "/device/$id", params: { id: selectedDevice.id } })}
                >
                  <ExternalLinkIcon className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Video feed for CCTVs */}
            {isCCTV && (
              <div className="flex flex-col gap-2">
                <h4 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Live Feed
                </h4>
                <CctvPlayer
                  hlsUrl={cctvHlsUrl}
                  streamName={
                    selectedDevice.type === "CCTV" ? String(selectedDevice.props.simulationStream ?? "") : undefined
                  }
                />
                {cctvHlsUrl && <p className="text-[10px] text-muted-foreground/50 break-all">{cctvHlsUrl}</p>}
              </div>
            )}

            {/* Sensor readings */}
            {isSensor && selectedDevice && (
              <SensorReadingPanel facilityId={facilityId} selectedDevice={selectedDevice} />
            )}

            {/* Log entries */}
            {deviceEvents.length > 0 && (
              <>
                <h4 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Event History
                </h4>
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
              </>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
