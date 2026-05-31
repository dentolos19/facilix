import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ActivityIcon, BatteryIcon, WifiIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button.tsx";
import type { DeviceDetail } from "#/functions/facilities";
import { fetchSimulationLatestReading, fetchSimulationSensor } from "#/lib/simulation/sensors";
import type { NormalizedReading, SimulationSensorDevice } from "#/lib/simulation/sensors";

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
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header with back navigation */}
      <div className="flex items-center gap-3">
        <Link to="/facility/$id" params={{ id: device.facilityId }}>
          <Button size="icon-sm" variant="ghost" aria-label="Back to facility">
            <ArrowLeftIcon className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="font-heading text-sm font-medium text-foreground">{device.name}</h1>
          <p className="text-[11px] text-muted-foreground/60">
            {device.facilityName} &middot; {sensorInfo?.sensorType ?? "Sensor"}
          </p>
        </div>
        <div className="ml-auto">
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
              device.status === "online"
                ? "bg-green-500/10 text-green-600"
                : "bg-red-500/10 text-red-600"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                device.status === "online" ? "bg-green-500" : "bg-red-500"
              }`}
            />
            {device.status}
          </span>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-1 gap-4">
          {/* Reading panel */}
          <div className="flex flex-1 flex-col gap-4">
            {/* Current value */}
            <div className="rounded-none border border-border bg-muted/20 p-4">
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

            {/* Health metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-none border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <BatteryIcon className="size-3" />
                  <span className="text-[10px] font-medium uppercase">Battery</span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums text-foreground/80">
                  {batteryPct}%
                </p>
              </div>
              <div className="rounded-none border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                  <WifiIcon className="size-3" />
                  <span className="text-[10px] font-medium uppercase">Signal</span>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums text-foreground/80">
                  {signalRssi} dBm
                </p>
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

          {/* Device info sidebar */}
          <div className="w-72 shrink-0">
            <div className="rounded-none border border-border bg-muted/20 p-3">
              <h3 className="mb-2 font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Device Information
              </h3>
              <dl className="flex flex-col gap-2 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground/60">ID</dt>
                  <dd className="font-mono text-foreground/80">{device.id.slice(0, 8)}&hellip;</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground/60">Type</dt>
                  <dd className="text-foreground/80">{device.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground/60">Sensor Type</dt>
                  <dd className="text-foreground/80">
                    {sensorInfo?.sensorType ?? String(device.data.sensorType ?? "unknown")}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground/60">Status</dt>
                  <dd className="text-foreground/80">{reading?.status ?? device.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground/60">Data Source</dt>
                  <dd className="text-foreground/80">{sensorDataSource}</dd>
                </div>
                {sensorInfo?.measurementRange && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground/60">Range</dt>
                    <dd className="text-foreground/80">
                      {sensorInfo.measurementRange.min}&ndash;{sensorInfo.measurementRange.max}{" "}
                      {sensorInfo.measurementRange.unit}
                    </dd>
                  </div>
                )}
                {sensorInfo?.intervalSeconds && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground/60">Interval</dt>
                    <dd className="text-foreground/80">{sensorInfo.intervalSeconds}s</dd>
                  </div>
                )}
                {device.notes && (
                  <div className="flex flex-col gap-0.5 border-t border-border pt-2 mt-1">
                    <dt className="text-muted-foreground/60">Notes</dt>
                    <dd className="text-foreground/70">{device.notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
