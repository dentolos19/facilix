import { useMemo } from "react";
import { VideoIcon } from "lucide-react";
import type { LogEntry } from "../-helpers/types";
import { LogLevelBadge } from "./monitor-logs-panel";

/** Individual log entries for a single selected device (monitor right panel). */
export function DeviceLogPanel({ logs, selectedDeviceId }: { logs: LogEntry[]; selectedDeviceId: string | null }) {
  const deviceLogs = useMemo(
    () => (selectedDeviceId ? logs.filter((l) => l.deviceId === selectedDeviceId) : []),
    [logs, selectedDeviceId],
  );

  const device = deviceLogs[0];
  const isCCTV = device?.deviceType === "CCTV";

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-4">
      <h3 className="shrink-0 font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Device Details
      </h3>

      {!selectedDeviceId && (
        <div className="flex flex-1 items-center justify-center px-2 text-center">
          <span className="text-[11px] text-muted-foreground/50">Click an IoT device on the map to view its logs</span>
        </div>
      )}

      {selectedDeviceId && deviceLogs.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[11px] text-muted-foreground/50">No logs for this device</span>
        </div>
      )}

      {device && (
        <div className="flex flex-col gap-2">
          {/* Device summary */}
          <div className="rounded-none border border-border bg-muted/20 p-2">
            <p className="text-xs font-medium text-foreground">{device.deviceName}</p>
            <p className="text-[11px] text-muted-foreground/70">Type: {device.deviceType}</p>
            <p className="text-[11px] text-muted-foreground/70">Logs: {deviceLogs.length} entries</p>
          </div>

          {/* Video feed placeholder for CCTVs */}
          {isCCTV && (
            <div className="relative flex flex-col gap-2">
              <h4 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Live Feed
              </h4>
              <div className="relative aspect-video w-full overflow-hidden rounded-none border border-border bg-muted/40">
                {/* Placeholder video feed area */}
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <VideoIcon className="size-6 text-muted-foreground/40" />
                  <span className="text-[11px] text-muted-foreground/50">Video feed placeholder</span>
                  <span className="text-[10px] text-muted-foreground/35">Connect a stream source to view live footage</span>
                </div>
                {/* Recording indicator */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-1.5 py-0.5">
                  <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[9px] font-medium text-white/80 uppercase">REC</span>
                </div>
                {/* Timestamp */}
                <div className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5">
                  <span className="text-[9px] font-medium text-white/80 tabular-nums">
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Individual log entries */}
          <h4 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Log History
          </h4>
          <div className="flex flex-col gap-1">
            {deviceLogs.map((log) => (
              <div
                className="flex flex-col gap-0.5 rounded-none border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed"
                key={log.id}
                style={{
                  borderLeftColor: log.level === "error" ? "#ef4444" : log.level === "warn" ? "#f59e0b" : "#22c55e",
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
        </div>
      )}
    </div>
  );
}
