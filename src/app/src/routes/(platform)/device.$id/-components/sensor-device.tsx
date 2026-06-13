import { ActivityIcon, BatteryIcon, WifiIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { DeviceDetail } from "#/src/lib/functions/facility";
import { getLatestSensorReading } from "#/src/lib/functions/sensors";
import { DeviceDetailShell, DeviceInformationCard } from "./device-detail-layout";
import { DeviceLogsTab } from "./device-logs";

const TABS = [
  { id: "live", label: "Live" },
  { id: "logs", label: "Logs" },
];

export function SensorDeviceDetail({ device }: { device: DeviceDetail }) {
  const sensorDataSource = String(device.data.sensorDataSource ?? "simulation");
  const threshold = Number(device.data.threshold ?? 50);
  const unit = String(device.data.unit ?? "");
  const deviceId = device.id;
  const facilityId = device.facilityId;

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("live");

  // Fetch latest reading on mount and poll every 10s
  useEffect(() => {
    if (!facilityId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const result = await getLatestSensorReading({ data: { facilityId, deviceId } });
        if (!cancelled) {
          setReading(result);
        }
      } catch {
        // Sensor offline — keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    const interval = setInterval(async () => {
      try {
        const result = await getLatestSensorReading({ data: { facilityId, deviceId } });
        if (!cancelled) setReading(result);
      } catch {
        // ignore
      }
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [facilityId, deviceId]);

  const sensorStatus =
    reading?.status === "ok"
      ? "online"
      : reading?.status === "degraded"
        ? "degraded"
        : reading?.status === "offline"
          ? "offline"
          : reading?.status === "error"
            ? "error"
            : undefined;

  return (
    <DeviceDetailShell
      activeTab={activeTab}
      device={device}
      onTabChange={setActiveTab}
      status={sensorStatus}
      subtitle={
        <>
          {device.facilityName} &middot; {String(device.data.sensorType ?? "Sensor")}
        </>
      }
      tabs={TABS}
    >
      {activeTab === "live" && (
        <SensorLiveTab
          device={device}
          loading={loading}
          reading={reading}
          sensorDataSource={sensorDataSource}
          threshold={threshold}
          unit={unit}
        />
      )}
      {activeTab === "logs" && <DeviceLogsTab device={device} />}
    </DeviceDetailShell>
  );
}

function SensorLiveTab({
  device,
  loading,
  reading,
  sensorDataSource,
  threshold,
  unit,
}: {
  device: DeviceDetail;
  loading: boolean;
  reading: {
    value: number;
    unit: string;
    status: string;
    batteryPct: number | null;
    signalRssiDbm: number | null;
    secondaryValue: number | null;
    secondaryUnit: string | null;
    timestamp: Date | null;
  } | null;
  sensorDataSource: string;
  threshold: number;
  unit: string;
}) {
  const value = reading?.value ?? 0;
  const isAboveThreshold = value > threshold;
  const batteryPct = reading?.batteryPct ?? 0;
  const signalRssi = reading?.signalRssiDbm ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <main className="flex min-h-0 flex-1 flex-col gap-4">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-none border border-border bg-muted/20">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 rounded-none border border-border bg-muted/20 p-4">
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-4xl font-light tabular-nums ${
                      isAboveThreshold ? "text-red-500" : "text-foreground"
                    }`}
                  >
                    {value.toFixed(1)}
                  </span>
                  <span className="text-lg text-muted-foreground/60">{unit}</span>
                </div>
                {reading?.secondaryValue != null && (
                  <p className="mt-1 text-[11px] text-muted-foreground/50">
                    {reading.secondaryValue.toFixed(1)} {reading.secondaryUnit ?? ""}
                  </p>
                )}
                {isAboveThreshold && (
                  <p className="mt-2 text-[11px] font-medium text-red-500">
                    Above threshold ({threshold}
                    {unit})
                  </p>
                )}
                {reading?.timestamp && (
                  <p className="mt-2 text-[10px] text-muted-foreground/40">
                    Last updated: {new Date(reading.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="grid shrink-0 grid-cols-3 gap-3">
              <div className="rounded-none border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <BatteryIcon className="size-3" />
                  <span className="text-[10px] font-medium uppercase">Battery</span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums text-foreground/80">{batteryPct.toFixed(0)}%</p>
              </div>
              <div className="rounded-none border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <WifiIcon className="size-3" />
                  <span className="text-[10px] font-medium uppercase">Signal</span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums text-foreground/80">{signalRssi} dBm</p>
              </div>
              <div className="rounded-none border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <ActivityIcon className="size-3" />
                  <span className="text-[10px] font-medium uppercase">Status</span>
                </div>
                <p className="mt-1 text-sm font-medium text-foreground/80">{reading?.status ?? "unknown"}</p>
              </div>
            </div>
          </>
        )}
      </main>

      <aside className="flex h-fit max-h-full w-full shrink-0 flex-col gap-3 overflow-y-auto lg:w-80">
        <DeviceInformationCard
          device={device}
          properties={[
            { label: "Sensor Type", value: String(device.data.sensorType ?? "unknown") },
            { label: "Data Source", value: sensorDataSource },
            { label: "Reading Status", value: reading?.status ?? "unknown" },
            { label: "Threshold", value: `${threshold}${unit}` },
          ]}
        />
      </aside>
    </div>
  );
}
