import { ShieldAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "#/src/components/ui/switch";
import type { DeviceDetail } from "#/src/lib/functions/facility";
import { getPlugin, normalizePlugins } from "#/src/lib/monitoring/plugins";
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
        <CctvAnomalyPluginsCard device={device} />
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

/**
 * Read-only summary of the anomaly plugins installed on this CCTV.
 * Editing happens in the facility editor's properties panel.
 */
function CctvAnomalyPluginsCard({ device }: { device: DeviceDetail }) {
  const configs = normalizePlugins(device.data.plugins);
  const installed = configs
    .map((c) => ({ config: c, plugin: getPlugin(c.pluginId) }))
    .filter(
      (entry): entry is { config: (typeof configs)[number]; plugin: NonNullable<ReturnType<typeof getPlugin>> } =>
        entry.plugin !== undefined,
    );

  return (
    <section className="rounded-none border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Anomaly Plugins
        </h2>
        <span className="text-[10px] text-muted-foreground/60">
          {installed.length === 0 ? "None" : `${installed.length}`}
        </span>
      </div>

      {installed.length === 0 ? (
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70">
          <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <p className="leading-snug">
            No intelligence plugins installed. Configure them in the facility editor to start detecting anomalies.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {installed.map(({ config, plugin }) => {
            // Read kind-specific display fields
            const kindLabels: string[] = [];
            if (plugin.kind === "object-anomaly") {
              const c = config as import("#/src/lib/monitoring/plugins").ObjectAnomalyDeviceConfig;
              const opts = plugin.options.filter((o) => c.selectedAnomalies.includes(o.id));
              kindLabels.push(...opts.map((o) => o.label));
            }
            if (plugin.kind === "object-counting") {
              const c = config as import("#/src/lib/monitoring/plugins").ObjectCountingDeviceConfig;
              const opts = plugin.options.filter((o) => c.selectedSignals.includes(o.id));
              kindLabels.push(...opts.map((o) => o.label));
            }
            const confidence = "confidence" in config ? (config as { confidence: number }).confidence : undefined;
            return (
              <div
                className="flex flex-col gap-1 rounded-none border border-border bg-background/50 p-2"
                key={plugin.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium text-foreground/80">{plugin.name}</p>
                  <span
                    className={
                      config.enabled
                        ? "rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 uppercase"
                        : "rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase"
                    }
                  >
                    {config.enabled ? "On" : "Off"}
                  </span>
                </div>
                {plugin.modelId && <p className="font-mono text-[10px] text-muted-foreground/60">{plugin.modelId}</p>}
                {kindLabels.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {kindLabels.map((label) => (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : plugin.kind === "segment-understanding" ? (
                  <p className="text-[10px] text-muted-foreground/60 leading-snug">
                    {(config as import("#/src/lib/monitoring/plugins").SegmentAnalysisDeviceConfig).prompt.length > 60
                      ? `"${(config as import("#/src/lib/monitoring/plugins").SegmentAnalysisDeviceConfig).prompt.slice(0, 60)}…"`
                      : `"${(config as import("#/src/lib/monitoring/plugins").SegmentAnalysisDeviceConfig).prompt}"`}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60">No signals selected</p>
                )}
                {confidence !== undefined && (
                  <p className="text-[10px] text-muted-foreground/60">Confidence ≥ {(confidence * 100).toFixed(0)}%</p>
                )}
                {plugin.kind === "object-counting" && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Alert when {(config as import("#/src/lib/monitoring/plugins").ObjectCountingDeviceConfig).operator}{" "}
                    {(config as import("#/src/lib/monitoring/plugins").ObjectCountingDeviceConfig).threshold}
                  </p>
                )}
                {plugin.kind === "segment-understanding" && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Severity: {(config as import("#/src/lib/monitoring/plugins").SegmentAnalysisDeviceConfig).severity}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
