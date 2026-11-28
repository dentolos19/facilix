import { ActivityIcon, AlertTriangleIcon, CheckCircleIcon, CpuIcon, LayersIcon, WifiOffIcon } from "lucide-react";

import type { UiFacilitySummary } from "#/lib/chat/ui";

export function FacilitySummaryCard({ data }: { data: UiFacilitySummary }) {
  const healthColor =
    data.healthScore >= 90 ? "text-green-500" : data.healthScore >= 70 ? "text-amber-500" : "text-red-500";

  return (
    <div className="my-2 flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{data.facilityName}</h3>
        <span className={`text-2xl font-bold tabular-nums ${healthColor}`}>{data.healthScore}%</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric icon={CpuIcon} label="Devices" value={data.deviceCount} />
        <Metric icon={LayersIcon} label="Zones" value={data.zoneCount} />
        <Metric icon={CheckCircleIcon} label="Online" value={data.onlineCount} valueClass="text-green-500" />
        {data.errorCount > 0 ? (
          <Metric icon={AlertTriangleIcon} label="Errors" value={data.errorCount} valueClass="text-red-500" />
        ) : data.offlineCount > 0 ? (
          <Metric icon={WifiOffIcon} label="Offline" value={data.offlineCount} valueClass="text-amber-500" />
        ) : (
          <Metric icon={ActivityIcon} label="Health" value={`${data.healthScore}%`} valueClass="text-green-500" />
        )}
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-border/50 bg-muted/20 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      <div className="min-w-0">
        <p className="text-[10px] leading-tight text-muted-foreground/60">{label}</p>
        <p className={`text-sm font-semibold tabular-nums ${valueClass ?? "text-foreground"}`}>{value}</p>
      </div>
    </div>
  );
}
