import { createFileRoute } from "@tanstack/react-router";
import { Loader2Icon, VideoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { DeviceDetail } from "#/src/lib/functions/facility";
import { getDevice } from "#/src/lib/functions/facility";
import { CctvDeviceDetail } from "./-components/cctv-device";
import { DeviceDetailLayout, DeviceDetailSidebar } from "./-components/device-detail-layout";
import { SensorDeviceDetail } from "./-components/sensor-device";

export const Route = createFileRoute("/(platform)/device/$id/")({
  component: Page,
});

function Page() {
  const { id: deviceId } = Route.useParams();
  const [device, setDevice] = useState<DeviceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getDevice({ data: { id: deviceId } });
        if (!cancelled) setDevice(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load device");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  // Error state
  if (error || !device) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <VideoIcon className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground/50">{error ?? "Device not found"}</p>
      </div>
    );
  }

  // Render the appropriate detail component based on device type
  switch (device.type) {
    case "CCTV":
      return <CctvDeviceDetail device={device} />;
    case "Sensor":
      return <SensorDeviceDetail device={device} />;
    default:
      return <GenericDeviceDetail device={device} />;
  }
}

/** Fallback for other device types (Signal, Marker, Zone). */
function GenericDeviceDetail({ device }: { device: DeviceDetail }) {
  return (
    <DeviceDetailLayout device={device} sidebar={<DeviceDetailSidebar device={device} />}>
      <div className="flex h-full items-center justify-center rounded-none border border-border bg-muted/20">
        <div className="flex flex-col items-center gap-2">
          <VideoIcon className="size-6 text-muted-foreground/30" />
          <span className="text-[11px] text-muted-foreground/50">
            No detail view available for {device.type} devices
          </span>
        </div>
      </div>
    </DeviceDetailLayout>
  );
}
