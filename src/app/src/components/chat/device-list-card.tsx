import { ActivityIcon, AlertTriangleIcon, CpuIcon, WifiOffIcon } from "lucide-react";

import type { UiDeviceEntry } from "#/lib/chat/ui";

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

export function DeviceListCard({ data }: { data: UiDeviceEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="border-border bg-muted/10 my-2 flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
        <CpuIcon className="text-muted-foreground/40 size-6" />
        <p className="text-muted-foreground/60 text-[11px]">No devices configured</p>
      </div>
    );
  }

  return (
    <div className="border-border my-2 overflow-hidden rounded-lg border">
      <div className="divide-border flex flex-col divide-y">
        {data.map((device) => {
          const reading = device.latestReading;
          return (
            <div className="flex items-start gap-3 px-3 py-2.5" key={device.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-tight font-medium">{device.name}</span>
                  <StatusBadge status={device.status} />
                </div>
                <div className="text-muted-foreground/70 flex items-center gap-2 text-[11px]">
                  <span>{device.type}</span>
                  {device.zoneName && (
                    <>
                      <span>{"\u00b7"}</span>
                      <span>{device.zoneName}</span>
                    </>
                  )}
                </div>
                {reading && (
                  <div className="text-muted-foreground/60 mt-1 flex items-center gap-3 text-[10px]">
                    <span>
                      {reading.sensorType}: {reading.value}
                      {reading.unit}
                    </span>
                    {reading.batteryPct != null && <span>Battery: {reading.batteryPct.toFixed(0)}%</span>}
                  </div>
                )}
              </div>
              <div className="shrink-0">
                {device.status === "error" || device.status === "offline" ? (
                  device.status === "error" ? (
                    <AlertTriangleIcon className="size-4 text-red-500" />
                  ) : (
                    <WifiOffIcon className="size-4 text-amber-500" />
                  )
                ) : (
                  <ActivityIcon className="size-4 text-green-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {data.length > 10 && (
        <div className="border-border/50 bg-muted/20 border-t px-3 py-1.5 text-center">
          <span className="text-muted-foreground/50 text-[10px]">{data.length} devices total</span>
        </div>
      )}
    </div>
  );
}
