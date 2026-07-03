import { ShieldAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Switch } from "#/components/ui/switch";
import type { DeviceDetail } from "#/lib/functions/facility";
import { getPlugin, isLegacyPlugin, normalizePlugins } from "#/lib/monitoring/plugins";
import { simulationHlsUrl } from "#/lib/simulation/cctv";
import { CctvPlayer } from "#/routes/(platform)/facility.$id/-components/cctv-player";

import { Route as DeviceRoute } from "../index";
import { CctvPlaybackTab } from "./cctv-playback";
import { CctvPredictionsTab } from "./cctv-predictions";
import { DeviceDetailShell, DeviceInformationCard, DevicePropertiesCard } from "./device-detail-layout";
import { DeviceEventsTab } from "./device-events-tab";

const TABS = [
  { id: "live", label: "Live" },
  { id: "logs", label: "Logs" },
  { id: "playback", label: "Playback" },
  { id: "predictions", label: "Predictions" },
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
  const { tab } = DeviceRoute.useSearch();
  const navigate = DeviceRoute.useNavigate();
  const activeTab = TABS.some((t) => t.id === tab) ? tab! : "live";

  const setActiveTab = (id: string) => {
    navigate({ search: { tab: id === "live" ? undefined : id }, replace: true });
  };

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
      {activeTab === "logs" && <DeviceEventsTab device={device} />}
      {activeTab === "playback" && <CctvPlaybackTab device={device} />}
      {activeTab === "predictions" && <CctvPredictionsTab device={device} />}
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
  const videoSource = String(device.data.videoSource ?? "simulation");
  const streamUrl = String(device.data.streamUrl ?? "");
  const streamPath = String(device.data.streamPath ?? "");
  const deviceId = String(device.data.deviceId ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <main className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="font-heading text-muted-foreground shrink-0 text-[11px] font-medium tracking-wider uppercase">
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
        <DeviceInformationCard device={device} />
        <DevicePropertiesCard
          properties={[
            { label: "Video Source", value: videoSource },
            ...(streamName && videoSource === "simulation"
              ? [{ label: "Simulation Stream", value: streamName, monospace: true }]
              : []),
            ...(streamUrl && videoSource !== "simulation"
              ? [{ label: "Stream URL", value: streamUrl, monospace: true }]
              : []),
            ...(streamPath ? [{ label: "Stream Path", value: streamPath, monospace: true }] : []),
            ...(deviceId ? [{ label: "Device ID", value: deviceId, monospace: true }] : []),
          ]}
        />
        <CctvCaptureSettingsCard device={device} />
        <CctvIntelligencePluginsCard device={device} />
        <CctvOptionsCard
          disabled={!hlsUrl}
          objectDetectionEnabled={objectDetectionEnabled}
          onObjectDetectionChange={onObjectDetectionChange}
        />
      </aside>
    </div>
  );
}

/**
 * Read-only card displaying the CCTV capture settings (segment duration).
 */
function CctvCaptureSettingsCard({ device }: { device: DeviceDetail }) {
  const raw = device.data.capture;
  const capture: {
    segments?: { durationSec?: number };
  } = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as typeof capture) : {};
  const segments = { durationSec: 30, ...capture.segments };

  return (
    <section className="border-border bg-muted/20 rounded-none border p-3">
      <h2 className="font-heading text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
        Capture Settings
      </h2>
      <div className="flex flex-col gap-2">
        {/* Segment capture */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-foreground/80 text-[11px] font-medium">Segments</p>
            <p className="text-muted-foreground/60 text-[10px] leading-snug">
              Continuous recording, {segments.durationSec ?? 30}s per segment
            </p>
          </div>
          <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
            On
          </span>
        </div>
      </div>
    </section>
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
    <section className="border-border bg-muted/20 rounded-none border p-3">
      <h2 className="font-heading text-muted-foreground mb-2 text-[11px] font-medium tracking-wider uppercase">
        Options
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground/80 text-[11px] font-medium">Live object detection</p>
          <p className="text-muted-foreground/60 mt-0.5 text-[10px] leading-snug">
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
        <p className="text-muted-foreground/50 mt-2 text-[10px]">Connect a stream before enabling detection.</p>
      )}
    </section>
  );
}

/**
 * Read-only summary of the intelligence plugins installed on this CCTV.
 * Editing happens in the facility editor's properties panel.
 *
 * Processing runs only for enabled operational plugins.
 */
function CctvIntelligencePluginsCard({ device }: { device: DeviceDetail }) {
  const configs = normalizePlugins(device.data.plugins);
  const installed = configs
    .map((c) => ({ config: c, plugin: getPlugin(c.pluginId) }))
    .filter(
      (entry): entry is { config: (typeof configs)[number]; plugin: NonNullable<ReturnType<typeof getPlugin>> } =>
        entry.plugin !== undefined,
    );

  return (
    <section className="border-border bg-muted/20 rounded-none border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-heading text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
          Intelligence Plugins
        </h2>
        <span className="text-muted-foreground/60 text-[10px]">
          {installed.length === 0 ? "None" : `${installed.length}`}
        </span>
      </div>

      {installed.length === 0 ? (
        <div className="text-muted-foreground/70 flex items-start gap-2 text-[11px]">
          <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <p className="leading-snug">No operational plugins installed for this camera.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {installed.map(({ config, plugin }) => {
            const isDetection =
              plugin.kind === "workflow-object-detection" && config.kind === "workflow-object-detection";
            const detConfig = isDetection ? config : null;
            const segConfig =
              plugin.kind === "segment-understanding" && config.kind === "segment-understanding" ? config : null;

            return (
              <div
                className="border-border bg-background/50 flex flex-col gap-1 rounded-none border p-2"
                key={plugin.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground/80 text-[11px] font-medium">{plugin.name}</p>
                    <p className="text-muted-foreground/50 font-mono text-[8px] uppercase">
                      {isLegacyPlugin(plugin) ? "Legacy" : plugin.category}
                    </p>
                  </div>
                  <span
                    className={
                      config.enabled
                        ? "rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 uppercase"
                        : "bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-medium uppercase"
                    }
                  >
                    {config.enabled ? "On" : "Off"}
                  </span>
                </div>
                {isDetection && detConfig && (
                  <>
                    {detConfig.classes && detConfig.classes.length > 0 && (
                      <p className="text-muted-foreground/60 text-[10px]">Classes: {detConfig.classes.join(", ")}</p>
                    )}
                    <p className="text-muted-foreground/60 text-[10px]">
                      Min confidence: {Math.round(detConfig.minConfidence * 100)}%
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {(detConfig.alerts ?? []).map((alert, i) => (
                        <p className="text-muted-foreground/60 text-[10px]" key={i}>
                          {alert.kind === "count-threshold" &&
                            `Alert: count ${alert.operator} ${alert.threshold} (${alert.thresholdMode}) [${alert.severity}]`}
                          {alert.kind === "object-enters" &&
                            `Alert: object enters${alert.labels?.length ? ` (${alert.labels.join(", ")})` : ""} [${alert.severity}]`}
                          {alert.kind === "object-leaves" &&
                            `Alert: object leaves${alert.labels?.length ? ` (${alert.labels.join(", ")})` : ""} [${alert.severity}]`}
                        </p>
                      ))}
                    </div>
                  </>
                )}
                {!isDetection && segConfig && (
                  <>
                    {(segConfig.alerts ?? []).length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        {segConfig.alerts.map((alert, i) => (
                          <p className="text-muted-foreground/60 text-[10px] leading-snug" key={i}>
                            {alert.kind === "scene-match" && (
                              <>
                                {alert.description.length > 50
                                  ? `"${alert.description.slice(0, 50)}…"`
                                  : `"${alert.description}"`}{" "}
                                [{alert.severity}]
                              </>
                            )}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
