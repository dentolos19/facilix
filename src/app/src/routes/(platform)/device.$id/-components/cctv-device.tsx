import { ShieldAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Switch } from "#/components/ui/switch";
import type { DeviceDetail } from "#/lib/functions/facility";
import { getPlugin, normalizePlugins } from "#/lib/monitoring/plugins";
import { simulationHlsUrl } from "#/lib/simulation/cctv";
import { CctvPlayer } from "#/routes/(platform)/facility.$id/-components/cctv-player";
import { CctvPlaybackTab } from "./cctv-playback";
import { DeviceDetailShell, DeviceInformationCard, DevicePropertiesCard } from "./device-detail-layout";
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
  const videoSource = String(device.data.videoSource ?? "simulation");
  const streamUrl = String(device.data.streamUrl ?? "");
  const streamPath = String(device.data.streamPath ?? "");
  const deviceId = String(device.data.deviceId ?? "");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <main className="flex min-h-0 flex-1 flex-col gap-2">
        <h2 className="shrink-0 font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
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
    <section className="rounded-none border border-border bg-muted/20 p-3">
      <h2 className="mb-2 font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
        Capture Settings
      </h2>
      <div className="flex flex-col gap-2">
        {/* Segment capture */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-[11px] text-foreground/80">Segments</p>
            <p className="text-[10px] text-muted-foreground/60 leading-snug">
              Continuous recording, {segments.durationSec ?? 30}s per segment
            </p>
          </div>
          <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 font-medium text-[10px] text-green-600">
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
    <section className="rounded-none border border-border bg-muted/20 p-3">
      <h2 className="mb-2 font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
        Options
      </h2>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[11px] text-foreground/80">Live object detection</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/60 leading-snug">
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
 * Read-only summary of the intelligence plugins installed on this CCTV.
 * Editing happens in the facility editor's properties panel.
 *
 * Note: Object detection runs only for enabled detection plugins.
 * Scene understanding runs only for enabled segment-understanding plugins.
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
    <section className="rounded-none border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-heading font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
          Intelligence Plugins
        </h2>
        <span className="text-[10px] text-muted-foreground/60">
          {installed.length === 0 ? "None" : `${installed.length}`}
        </span>
      </div>

      {installed.length === 0 ? (
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground/70">
          <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <p className="leading-snug">No plugins installed. Add detection or language plugins to analyze segments.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {installed.map(({ config, plugin }) => {
            const isDetection = plugin.kind === "workflow-object-detection";
            const detConfig = isDetection
              ? (config as import("#/lib/monitoring/plugins").WorkflowObjectDetectionDeviceConfig)
              : null;
            const segConfig = !isDetection
              ? (config as import("#/lib/monitoring/plugins").SegmentAnalysisDeviceConfig)
              : null;

            return (
              <div
                className="flex flex-col gap-1 rounded-none border border-border bg-background/50 p-2"
                key={plugin.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[11px] text-foreground/80">{plugin.name}</p>
                  <span
                    className={
                      config.enabled
                        ? "rounded bg-green-500/10 px-1.5 py-0.5 font-medium text-[10px] text-green-600 uppercase"
                        : "rounded bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase"
                    }
                  >
                    {config.enabled ? "On" : "Off"}
                  </span>
                </div>
                {isDetection && detConfig && (
                  <>
                    <p className="text-[10px] text-muted-foreground/60">
                      Alert when {detConfig.operator} {detConfig.threshold} ({detConfig.thresholdMode})
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Min confidence: {Math.round(detConfig.minConfidence * 100)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">Severity: {detConfig.alertSeverity}</p>
                  </>
                )}
                {!isDetection && segConfig && (
                  <>
                    <p className="text-[10px] text-muted-foreground/60 leading-snug">
                      {segConfig.prompt.length > 60 ? `"${segConfig.prompt.slice(0, 60)}…"` : `"${segConfig.prompt}"`}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">Severity: {segConfig.severity}</p>
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
