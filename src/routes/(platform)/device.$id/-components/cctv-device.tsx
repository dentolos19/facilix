import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "#/components/ui/button.tsx";
import { CctvPlayer } from "#/routes/(platform)/facility.$id/-components/cctv-player";
import { simulationHlsUrl } from "#/lib/simulation/cctv";
import type { DeviceDetail } from "#/functions/facilities";

export function CctvDeviceDetail({ device }: { device: DeviceDetail }) {
  const hlsUrl = useMemo(() => {
    const source = String(device.data.videoSource ?? "simulation");
    if (source === "simulation") {
      const streamName = String(device.data.simulationStream ?? "");
      return streamName ? simulationHlsUrl(streamName) : null;
    }
    return null;
  }, [device]);

  const streamName = String(device.data.simulationStream ?? "");

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
            {device.facilityName} &middot; CCTV
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

      {/* Main content area */}
      <div className="flex flex-1 gap-4">
        {/* Video feed */}
        <div className="flex flex-1 flex-col gap-2">
          <h2 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Live Feed
          </h2>
          <div className="flex-1">
            <CctvPlayer hlsUrl={hlsUrl} streamName={streamName} />
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
                <dt className="text-muted-foreground/60">Status</dt>
                <dd className="text-foreground/80">{device.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground/60">Video Source</dt>
                <dd className="text-foreground/80">
                  {String(device.data.videoSource ?? "simulation")}
                </dd>
              </div>
              {streamName && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground/60">Stream</dt>
                  <dd className="font-mono text-foreground/80">{streamName}</dd>
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
    </div>
  );
}
