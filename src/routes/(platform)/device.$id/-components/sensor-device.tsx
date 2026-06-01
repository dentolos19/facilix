import { ActivityIcon, BatteryIcon, WifiIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { DeviceDetail } from "#/lib/functions/facility";
import type { NormalizedReading, SimulationSensorDevice } from "#/lib/simulation/sensors";
import { fetchSimulationLatestReading, fetchSimulationSensor } from "#/lib/simulation/sensors";
import { DeviceDetailLayout, DeviceDetailSidebar } from "./device-detail-layout";

export function SensorDeviceDetail({ device }: { device: DeviceDetail }) {
  const simulationDeviceId = String(device.data.simulationDeviceId ?? "");
  const sensorDataSource = String(device.data.sensorDataSource ?? "simulation");
  const threshold = Number(device.data.threshold ?? 50);
  const unit = String(device.data.unit ?? "");

  const [sensorInfo, setSensorInfo] = useState<SimulationSensorDevice | null>(null);
  const [reading, setReading] = useState<NormalizedReading | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch sensor info and latest reading on mount
  useEffect(() => {
    if (sensorDataSource !== "simulation" || !simulationDeviceId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [info, latest] = await Promise.all([
          fetchSimulationSensor(simulationDeviceId),
          fetchSimulationLatestReading(simulationDeviceId),
        ]);
        if (!cancelled) {
          setSensorInfo(info);
          setReading(latest);
        }
      } catch {
        // Sensor offline — keep defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Poll every 10s
    const interval = setInterval(async () => {
      try {
        const latest = await fetchSimulationLatestReading(simulationDeviceId);
        if (!cancelled) setReading(latest);
      } catch {
        // ignore
      }
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [simulationDeviceId, sensorDataSource]);

  const value = reading?.value ?? 0;
  const isAboveThreshold = value > threshold;
  const batteryPct = reading?.batteryPct ?? sensorInfo?.batteryPct ?? 0;
  const signalRssi = reading?.signalRssiDbm ?? sensorInfo?.signalRssiDbm ?? 0;

  return (
    <DeviceDetailLayout
      device={device}
      sidebar={
        <DeviceDetailSidebar
          device={device}
          properties={[
            { label: "Sensor Type", value: sensorInfo?.sensorType ?? String(device.data.sensorType ?? "unknown") },
            { label: "Data Source", value: sensorDataSource },
            { label: "Reading Status", value: reading?.status ?? sensorInfo?.status ?? "unknown" },
            { label: "Threshold", value: `${threshold}${unit}` },
            ...(sensorInfo?.measurementRange
              ? [
                  {
                    label: "Range",
                    value: `${sensorInfo.measurementRange.min}–${sensorInfo.measurementRange.max} ${sensorInfo.measurementRange.unit}`,
                  },
                ]
              : []),
            ...(sensorInfo?.intervalSeconds ? [{ label: "Interval", value: `${sensorInfo.intervalSeconds}s` }] : []),
          ]}
        />
      }
      subtitle={
        <>
          {device.facilityName} &middot; {sensorInfo?.sensorType ?? "Sensor"}
        </>
      }
    >
      {loading ? (
        <div className="flex h-full items-center justify-center">
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-4">
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
              <p className="mt-1 text-sm font-medium tabular-nums text-foreground/80">{batteryPct}%</p>
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
              <p className="mt-1 text-sm font-medium text-foreground/80">
                {reading?.status ?? sensorInfo?.status ?? "unknown"}
              </p>
            </div>
          </div>
        </div>
      )}
    </DeviceDetailLayout>
  );
}
