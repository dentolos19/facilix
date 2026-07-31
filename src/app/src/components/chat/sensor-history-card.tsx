import { ActivityIcon } from "lucide-react";

import type { UiSensorHistory } from "#/lib/chat/ui";

const STATUS_COLORS: Record<string, string> = {
  ok: "text-green-500",
  degraded: "text-amber-500",
  offline: "text-red-500",
  error: "text-red-500",
};

export function SensorHistoryCard({ data }: { data: UiSensorHistory }) {
  if (data.readings.length === 0) {
    return (
      <div className="border-border bg-muted/10 my-2 flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
        <ActivityIcon className="text-muted-foreground/40 size-6" />
        <p className="text-muted-foreground/60 text-[11px]">No sensor readings available</p>
      </div>
    );
  }

  const grouped = new Map<string, typeof data.readings>();
  for (const r of data.readings) {
    const key = r.deviceName;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  return (
    <div className="border-border my-2 overflow-hidden rounded-lg border">
      <div className="divide-border flex flex-col divide-y">
        {Array.from(grouped.entries()).map(([deviceName, readings]) => {
          const latest = readings[0];
          const values = readings.slice(0, 20);
          const maxVal = Math.max(...values.map((v) => v.value), 1);
          return (
            <div className="px-3 py-2.5" key={deviceName}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{deviceName}</span>
                <span className={`text-xs font-semibold tabular-nums ${STATUS_COLORS[latest.status] ?? ""}`}>
                  {latest.value.toFixed(1)}
                  {latest.unit}
                </span>
              </div>
              <p className="text-muted-foreground/60 mt-0.5 text-[10px]">
                {latest.sensorType}
                {latest.batteryPct != null && ` · Battery ${latest.batteryPct.toFixed(0)}%`}
              </p>
              {values.length > 1 && (
                <div className="mt-1.5 flex items-end gap-0.5" style={{ height: 32 }}>
                  {values.map((r, i) => {
                    const pct = (r.value / maxVal) * 100;
                    return (
                      <div
                        className="w-full rounded-t"
                        key={r.timestamp}
                        style={{
                          height: `${Math.max(pct, 4)}%`,
                          backgroundColor:
                            r.status === "ok"
                              ? "var(--color-green-500, #22c55e)"
                              : r.status === "degraded"
                                ? "var(--color-amber-500, #f59e0b)"
                                : "var(--color-red-500, #ef4444)",
                          opacity: 0.6 + 0.4 * ((i + 1) / values.length),
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
