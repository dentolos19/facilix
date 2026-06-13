import { useMemo, useState } from "react";
import { Switch } from "#/src/components/ui/switch";
import type { DeviceDetail } from "#/src/lib/functions/facility";
import { simulationHlsUrl } from "#/src/lib/simulation/cctv";
import { CctvPlayer } from "#/src/routes/(platform)/facility.$id/-components/cctv-player";
import { CctvPlaybackTab } from "./cctv-playback";
import { DeviceDetailShell, DeviceInformationCard } from "./device-detail-layout";
import { DeviceLogsTab } from "./device-logs";

const TABS = [
  { id: "live", label: "Live" },
  { id: "logs", label: "Logs" },
  { id: "playback", label: "Playback" },
];

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
  const [objectDetectionEnabled, setObjectDetectionEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState("live");

  // Derive status: if an HLS URL is available the stream is configured → online
  const cctvStatus = hlsUrl ? "online" : "offline";

  return (
    <DeviceDetailShell
      activeTab={activeTab}
      device={device}
      onTabChange={setActiveTab}
      status={cctvStatus}
      subtitle={<>{device.facilityName} &middot; CCTV</>}
      tabs={TABS}
    >
      {activeTab === "live" && (
        <CctvLiveTab
          device={device}
          hlsUrl={hlsUrl}
          objectDetectionEnabled={objectDetectionEnabled}
          onObjectDetectionChange={setObjectDetectionEnabled}
          streamName={streamName}
        />
      )}
      {activeTab === "logs" && <DeviceLogsTab device={device} />}
      {activeTab === "playback" && <CctvPlaybackTab device={device} />}
    </DeviceDetailShell>
  );
}

function CctvLiveTab({
  device,
  hlsUrl,
  streamName,
  objectDetectionEnabled,
  onObjectDetectionChange,
}: {
  device: DeviceDetail;
  hlsUrl: string | null;
  streamName: string;
  objectDetectionEnabled: boolean;
  onObjectDetectionChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <main className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="shrink-0 font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Live Feed
        </h2>
        <div className="min-h-0 flex-1">
          <CctvPlayer
            className="h-full min-h-0"
            enableExpandedDialog={false}
            hlsUrl={hlsUrl}
            objectDetectionEnabled={objectDetectionEnabled}
            showAdvancedControls
            streamName={streamName}
          />
        </div>
      </main>

      <aside className="flex h-fit max-h-full w-full shrink-0 flex-col gap-3 overflow-y-auto lg:w-80">
        <DeviceInformationCard
          device={device}
          properties={[
            { label: "Video Source", value: String(device.data.videoSource ?? "simulation") },
            ...(streamName ? [{ label: "Stream", value: streamName, monospace: true }] : []),
          ]}
        />
        <CctvOptionsCard
          disabled={!hlsUrl}
          objectDetectionEnabled={objectDetectionEnabled}
          onObjectDetectionChange={onObjectDetectionChange}
        />
      </aside>
    </div>
  );
}

function CctvOptionsCard({
  disabled,
  objectDetectionEnabled,
  onObjectDetectionChange,
}: {
  disabled: boolean;
  objectDetectionEnabled: boolean;
  onObjectDetectionChange: (enabled: boolean) => void;
}) {
  return (
    <section className="rounded-none border border-border bg-muted/20 p-3">
      <h2 className="mb-2 font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        Options
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-foreground/80">Live object detection</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground/60">
            Draw MediaPipe labels and bounding boxes on the current HLS feed.
          </p>
        </div>
        <Switch
          aria-label="Enable live object detection"
          checked={objectDetectionEnabled}
          disabled={disabled}
          onCheckedChange={onObjectDetectionChange}
          size="sm"
        />
      </div>
      {disabled && (
        <p className="mt-2 text-[10px] text-muted-foreground/50">Connect a stream before enabling detection.</p>
      )}
    </section>
  );
}
