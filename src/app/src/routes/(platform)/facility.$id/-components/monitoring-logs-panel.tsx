import { ScrollArea } from "#/components/ui/scroll-area";

import type { LogEntry } from "../-helpers/types";

/** Time-ordered feed of all IoT device logs (monitoring left panel). */
export function MonitoringLogsPanel({
  logs,
  selectedDeviceId,
  onSelectDevice,
}: {
  logs: LogEntry[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-heading text-muted-foreground shrink-0 text-xs font-medium tracking-wider uppercase">
          Global Events
        </h3>

        {logs.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-muted-foreground/50 text-[11px]">No events yet</span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {logs.slice(0, 200).map((log) => (
            <button
              className={`hover:bg-muted flex flex-col gap-0.5 rounded-none px-2 py-1.5 text-left text-[11px] leading-relaxed transition-colors ${
                selectedDeviceId === log.deviceId ? "bg-muted" : ""
              }`}
              key={log.id}
              onClick={() => onSelectDevice(selectedDeviceId === log.deviceId ? null : log.deviceId)}
              type="button"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-foreground/80 shrink-0 font-medium">{log.deviceName}</span>
                <LogLevelBadge level={log.level} />
              </div>
              <span className="text-muted-foreground/70">{log.message}</span>
              <span className="text-muted-foreground/40">{log.timestamp.toLocaleTimeString()}</span>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

/** Small coloured badge for log severity. */
export function LogLevelBadge({ level }: { level: LogEntry["level"] }) {
  const colors: Record<LogEntry["level"], string> = {
    info: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    error: "bg-red-500/15 text-red-600 dark:text-red-400",
  };
  return <span className={`rounded-none px-1 py-0.5 text-[10px] font-medium uppercase ${colors[level]}`}>{level}</span>;
}
