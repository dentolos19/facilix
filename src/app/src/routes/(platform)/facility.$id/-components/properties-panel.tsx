import { PlusIcon, RefreshCwIcon, ShieldAlertIcon, Trash2, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import {
  DEFAULT_COUNTING_OPERATOR,
  DEFAULT_COUNTING_THRESHOLD,
  DEFAULT_PLUGIN_CONFIDENCE,
  type ComparisonOperator,
  type CountThresholdAlertRule,
  type DetectionAlertRule,
  type DevicePluginConfig,
  createPluginConfig,
  getPlugin,
  normalizePlugins,
  PLUGINS,
  type Plugin,
  type SceneAlertRule,
  type SceneMatchAlertRule,
  type SegmentAnalysisDeviceConfig,
  type ThresholdMode,
  type WorkflowObjectDetectionDeviceConfig,
} from "#/lib/monitoring/plugins";
import type { SimulationStream } from "#/lib/simulation/cctv";
import { fetchSimulationStreams } from "#/lib/simulation/cctv";
import { fetchSimulationSensors, type SimulationSensorDevice } from "#/lib/simulation/sensors";

import type { PropertiesPanelProps } from "../-helpers/types";
import { DEFAULT_ICON_SHAPES, ICON_SHAPE_OPTIONS } from "../-helpers/types";
import { CaptureSettingsSection } from "./capture-settings";

/** Right-side properties panel. Shows selected item details in edit mode. */
export function PropertiesPanel({
  editMode,
  placedItems,
  selectedItemId,
  onUpdateItem,
  onUpdateLayout,
  onDeleteItem,
}: PropertiesPanelProps) {
  const selected = placedItems.find((i) => i.id === selectedItemId) ?? null;
  const isReadOnly = editMode === "monitoring";

  // Fetch available simulation streams from the combined simulator
  const [fetchedStreams, setFetchedStreams] = useState<SimulationStream[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [streamsError, setStreamsError] = useState<string | null>(null);

  async function refreshSimulationStreams() {
    setStreamsLoading(true);
    setStreamsError(null);
    try {
      setFetchedStreams(await fetchSimulationStreams());
    } catch (error) {
      setFetchedStreams([]);
      setStreamsError(error instanceof Error ? error.message : "Unable to load simulation streams.");
    } finally {
      setStreamsLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadStreams() {
      setStreamsLoading(true);
      setStreamsError(null);
      try {
        const streams = await fetchSimulationStreams();
        if (!ignore) setFetchedStreams(streams);
      } catch (error) {
        if (!ignore) {
          setFetchedStreams([]);
          setStreamsError(error instanceof Error ? error.message : "Unable to load simulation streams.");
        }
      } finally {
        if (!ignore) setStreamsLoading(false);
      }
    }

    void loadStreams();
    return () => {
      ignore = true;
    };
  }, []);

  // Only use streams fetched live from the simulator (no static fallbacks)
  const allStreams = fetchedStreams;

  // Fetch available simulation sensor devices from the live simulator
  const [fetchedSensorDevices, setFetchedSensorDevices] = useState<SimulationSensorDevice[]>([]);
  const [sensorDevicesLoading, setSensorDevicesLoading] = useState(false);
  const [sensorDevicesError, setSensorDevicesError] = useState<string | null>(null);

  async function refreshSimulationSensorDevices() {
    setSensorDevicesLoading(true);
    setSensorDevicesError(null);
    try {
      setFetchedSensorDevices(await fetchSimulationSensors());
    } catch (error) {
      setFetchedSensorDevices([]);
      setSensorDevicesError(error instanceof Error ? error.message : "Unable to load simulation devices.");
    } finally {
      setSensorDevicesLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;

    async function loadSensorDevices() {
      setSensorDevicesLoading(true);
      setSensorDevicesError(null);
      try {
        const devices = await fetchSimulationSensors();
        if (!ignore) setFetchedSensorDevices(devices);
      } catch (error) {
        if (!ignore) {
          setFetchedSensorDevices([]);
          setSensorDevicesError(error instanceof Error ? error.message : "Unable to load simulation devices.");
        }
      } finally {
        if (!ignore) setSensorDevicesLoading(false);
      }
    }

    void loadSensorDevices();
    return () => {
      ignore = true;
    };
  }, []);

  const allSensorDevices = fetchedSensorDevices;

  // Auto-select first available stream if current selection is empty
  useEffect(() => {
    if (!selected || selected.type !== "CCTV" || isReadOnly) return;
    if (String(selected.props.videoSource ?? "simulation") !== "simulation") return;
    const currentStream = String(selected.props.simulationStream ?? "");
    if (!currentStream && allStreams.length > 0) {
      onUpdateItem(selected.id, {
        props: { simulationStream: allStreams[0].name },
      });
    }
  }, [selected?.id, allStreams.length, isReadOnly, selected, onUpdateItem, allStreams]);

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex min-h-full w-full flex-col p-4">
        {/* ── Header with title and delete button ── */}
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="font-heading text-muted-foreground text-xs font-medium tracking-wider uppercase">
            Properties
          </h3>
          {selected && editMode === "edit" && (
            <Button
              aria-label="Delete component"
              className="text-destructive hover:text-destructive/80"
              onClick={() => onDeleteItem(selected.id)}
              size="icon-sm"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>

        {!selected && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 text-center">
            <span className="text-muted-foreground/50 text-[11px]">
              {editMode === "monitoring"
                ? "Switch to Edit mode to select components"
                : "Click a component on the canvas to view its properties"}
            </span>
          </div>
        )}

        {selected && (
          <Accordion defaultValue={["basic-info", "data-source"]} type="multiple">
            {/* ── Section 1: Basic Information (all types) ── */}
            <AccordionItem value="basic-info">
              <AccordionTrigger>Basic Information</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  {isReadOnly && (
                    <p className="bg-muted text-muted-foreground rounded-none px-2 py-1 text-[11px]">
                      Read-only — switch to Edit to modify
                    </p>
                  )}

                  <Field label="Name" readOnly={isReadOnly}>
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { name: e.target.value })}
                      readOnly={isReadOnly}
                      value={selected.name}
                    />
                  </Field>

                  <Field label="Type">
                    <div className="border-input bg-muted/30 text-muted-foreground flex h-8 items-center rounded-none border px-2.5 text-xs">
                      {selected.type}
                    </div>
                  </Field>

                  {selected.type !== "Zone" && (
                    <Field label="Zone">
                      <div className="border-input bg-muted/30 text-muted-foreground flex h-8 items-center rounded-none border px-2.5 text-xs">
                        {placedItems.find((i) => i.type === "Zone" && i.id === selected.zoneId)?.name ?? "Unassigned"}
                      </div>
                    </Field>
                  )}

                  <Field label="Position" noGrow>
                    <div className="flex gap-2">
                      <Input
                        className="pointer-events-none w-1/2 opacity-60"
                        readOnly
                        tabIndex={-1}
                        value={Math.round(selected.x)}
                      />
                      <Input
                        className="pointer-events-none w-1/2 opacity-60"
                        readOnly
                        tabIndex={-1}
                        value={Math.round(selected.y)}
                      />
                    </div>
                  </Field>

                  {selected.type === "Zone" && (
                    <Field label="Size" noGrow>
                      <div className="flex gap-2">
                        <Input
                          className={isReadOnly ? "pointer-events-none w-1/2 opacity-60" : "w-1/2"}
                          onChange={(e) => onUpdateLayout(selected.id, { width: Math.max(10, Number(e.target.value)) })}
                          readOnly={isReadOnly}
                          type="number"
                          value={selected.width}
                        />
                        <Input
                          className={isReadOnly ? "pointer-events-none w-1/2 opacity-60" : "w-1/2"}
                          onChange={(e) =>
                            onUpdateLayout(selected.id, { height: Math.max(10, Number(e.target.value)) })
                          }
                          readOnly={isReadOnly}
                          type="number"
                          value={selected.height}
                        />
                      </div>
                    </Field>
                  )}

                  <Field label="Notes" noGrow>
                    <textarea
                      className={`border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 dark:bg-input/30 dark:disabled:bg-input/80 h-16 w-full min-w-0 resize-none rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}
                      onChange={(e) => onUpdateItem(selected.id, { notes: e.target.value })}
                      readOnly={isReadOnly}
                      rows={3}
                      value={selected.notes}
                    />
                  </Field>

                  <Field label="Icon Color">
                    <div className="flex gap-2">
                      <input
                        className="border-input h-8 w-10 cursor-pointer rounded-none border bg-transparent p-0.5 disabled:pointer-events-none disabled:opacity-60"
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateItem(selected.id, { props: { iconColor: e.target.value } })}
                        type="color"
                        value={String(selected.props.iconColor ?? "#3b82f6")}
                      />
                      <Input
                        className={isReadOnly ? "pointer-events-none flex-1 opacity-60" : "flex-1"}
                        onChange={(e) => onUpdateItem(selected.id, { props: { iconColor: e.target.value } })}
                        readOnly={isReadOnly}
                        value={String(selected.props.iconColor ?? "")}
                      />
                    </div>
                  </Field>

                  {selected.type !== "Zone" && ICON_SHAPE_OPTIONS[selected.type] && (
                    <Field label="Icon Shape">
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(value) => onUpdateItem(selected.id, { props: { iconShape: value } })}
                        value={String(selected.props.iconShape ?? DEFAULT_ICON_SHAPES[selected.type])}
                      >
                        <SelectTrigger className={`w-full ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
                          <SelectValue placeholder="Select icon" />
                        </SelectTrigger>
                        <SelectContent>
                          {ICON_SHAPE_OPTIONS[selected.type].map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ── Section 2: Data Source (varies by component type) ── */}
            {selected.type === "Marker" && (
              <AccordionItem value="data-source">
                <AccordionTrigger>Data Source</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2">
                    <Field label="Label">
                      <Input
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                        onChange={(e) => onUpdateItem(selected.id, { props: { label: e.target.value } })}
                        placeholder="Short display text"
                        readOnly={isReadOnly}
                        value={String(selected.props.label ?? "")}
                      />
                    </Field>
                    <Field label="Marker Type">
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(value) => onUpdateItem(selected.id, { props: { markerType: value } })}
                        value={String(selected.props.markerType ?? "")}
                      >
                        <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="warning">Warning</SelectItem>
                          <SelectItem value="alert">Alert</SelectItem>
                          <SelectItem value="danger">Danger</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {selected.type === "CCTV" && (
              <AccordionItem value="data-source">
                <AccordionTrigger>Data Source</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2">
                    <Field label="Video Source">
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(value) => onUpdateItem(selected.id, { props: { videoSource: value } })}
                        value={String(selected.props.videoSource ?? "simulation")}
                      >
                        <SelectTrigger className={`w-full ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
                          <SelectValue placeholder="Select video source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simulation">Simulation</SelectItem>
                          <SelectItem value="rtsp">Stream (RTSP)</SelectItem>
                          <SelectItem value="rtmp">Stream (RTMP)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {String(selected.props.videoSource ?? "simulation") === "simulation" ? (
                      <>
                        <Field label="Simulation Stream">
                          <div className="flex gap-2">
                            <Select
                              disabled={isReadOnly || allStreams.length === 0}
                              onValueChange={(value) =>
                                onUpdateItem(selected.id, { props: { simulationStream: value } })
                              }
                              value={
                                allStreams.some((stream) => stream.name === selected.props.simulationStream)
                                  ? String(selected.props.simulationStream)
                                  : ""
                              }
                            >
                              <SelectTrigger
                                className={`w-full ${isReadOnly || allStreams.length === 0 ? "pointer-events-none opacity-60" : ""}`}
                              >
                                <SelectValue
                                  placeholder={
                                    streamsLoading
                                      ? "Loading simulation streams..."
                                      : allStreams.length === 0
                                        ? "No simulation streams available"
                                        : "Select a video file"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {allStreams.map((s) => (
                                  <SelectItem key={s.name} value={s.name}>
                                    {s.label ?? s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              aria-label="Refresh simulation streams"
                              disabled={streamsLoading}
                              onClick={() => void refreshSimulationStreams()}
                              size="icon-sm"
                              type="button"
                              variant="outline"
                            >
                              <RefreshCwIcon className={`size-3.5 ${streamsLoading ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                          {streamsError && <p className="text-destructive text-[10px]">{streamsError}</p>}
                        </Field>
                      </>
                    ) : (
                      <Field label="Stream URL">
                        <Input
                          className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                          onChange={(e) => onUpdateItem(selected.id, { props: { streamUrl: e.target.value } })}
                          placeholder={
                            String(selected.props.videoSource ?? "") === "rtmp"
                              ? "rtmp://192.168.1.100/live/stream1"
                              : "rtsp://192.168.1.100/stream1"
                          }
                          readOnly={isReadOnly}
                          value={String(selected.props.streamUrl ?? "")}
                        />
                      </Field>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {selected.type === "CCTV" && (
              <AccordionItem value="capture-settings">
                <AccordionTrigger>Capture Settings</AccordionTrigger>
                <AccordionContent>
                  <CaptureSettingsSection
                    capture={selected.props.capture}
                    isReadOnly={isReadOnly}
                    onChange={(next) =>
                      onUpdateItem(selected.id, {
                        props: { capture: next as unknown as import("../-helpers/types").JsonValue },
                      })
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            )}

            {selected.type === "CCTV" && (
              <AccordionItem value="plugins">
                <AccordionTrigger>Intelligence Plugins</AccordionTrigger>
                <AccordionContent>
                  <CctvPluginsSection
                    configs={normalizePlugins(selected.props.plugins)}
                    isReadOnly={isReadOnly}
                    onChange={(next) =>
                      onUpdateItem(selected.id, {
                        props: { plugins: next as unknown as import("../-helpers/types").JsonValue },
                      })
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            )}

            {selected.type === "Sensor" && (
              <AccordionItem value="data-source">
                <AccordionTrigger>Data Source</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2">
                    <Field label="Data Source">
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(value) => onUpdateItem(selected.id, { props: { sensorDataSource: value } })}
                        value={String(selected.props.sensorDataSource ?? "simulation")}
                      >
                        <SelectTrigger className={`w-full ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
                          <SelectValue placeholder="Select data source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simulation">Simulation</SelectItem>
                          <SelectItem value="http-pull">HTTP Pull</SelectItem>
                          <SelectItem value="http-push">HTTP Push / Ingest</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    {String(selected.props.sensorDataSource ?? "simulation") === "simulation" ? (
                      <>
                        <Field label="Simulation Device">
                          <div className="flex gap-2">
                            <Select
                              disabled={isReadOnly || allSensorDevices.length === 0}
                              onValueChange={(value) => {
                                const device = allSensorDevices.find((s) => s.deviceId === value);
                                onUpdateItem(selected.id, {
                                  props: {
                                    simulationDeviceId: value,
                                    sensorType: device?.sensorType ?? "",
                                  },
                                });
                              }}
                              value={
                                allSensorDevices.some((device) => device.deviceId === selected.props.simulationDeviceId)
                                  ? String(selected.props.simulationDeviceId)
                                  : ""
                              }
                            >
                              <SelectTrigger
                                className={`w-full ${isReadOnly || allSensorDevices.length === 0 ? "pointer-events-none opacity-60" : ""}`}
                              >
                                <SelectValue
                                  placeholder={
                                    sensorDevicesLoading
                                      ? "Loading simulation devices..."
                                      : allSensorDevices.length === 0
                                        ? "No simulation devices available"
                                        : "Select a sensor device"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {allSensorDevices.map((s) => (
                                  <SelectItem key={s.deviceId} value={s.deviceId}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              aria-label="Refresh simulation devices"
                              disabled={sensorDevicesLoading}
                              onClick={() => void refreshSimulationSensorDevices()}
                              size="icon-sm"
                              type="button"
                              variant="outline"
                            >
                              <RefreshCwIcon className={`size-3.5 ${sensorDevicesLoading ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                          {sensorDevicesError && <p className="text-destructive text-[10px]">{sensorDevicesError}</p>}
                        </Field>
                        <Field label="Poll Interval (s)">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) =>
                              onUpdateItem(selected.id, { props: { pollInterval: Number(e.target.value) } })
                            }
                            placeholder="e.g. 30"
                            readOnly={isReadOnly}
                            type="number"
                            value={String(selected.props.pollInterval ?? "")}
                          />
                        </Field>
                      </>
                    ) : String(selected.props.sensorDataSource ?? "") === "http-pull" ? (
                      <>
                        <Field label="Pull URL">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) => onUpdateItem(selected.id, { props: { pullUrl: e.target.value } })}
                            placeholder="http://device-ip:8080/sensor/reading"
                            readOnly={isReadOnly}
                            value={String(selected.props.pullUrl ?? "")}
                          />
                        </Field>
                        <Field label="Sensor Type">
                          <Select
                            disabled={isReadOnly}
                            onValueChange={(value) => onUpdateItem(selected.id, { props: { sensorType: value } })}
                            value={String(selected.props.sensorType ?? "")}
                          >
                            <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                              <SelectValue placeholder="Select sensor type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="temperature">Temperature</SelectItem>
                              <SelectItem value="humidity">Humidity</SelectItem>
                              <SelectItem value="pressure">Pressure</SelectItem>
                              <SelectItem value="air_quality">Air Quality</SelectItem>
                              <SelectItem value="vibration">Vibration</SelectItem>
                              <SelectItem value="motion">Motion</SelectItem>
                              <SelectItem value="leak">Leak</SelectItem>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="door_contact">Door Contact</SelectItem>
                              <SelectItem value="battery">Battery</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Unit">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) => onUpdateItem(selected.id, { props: { unit: e.target.value } })}
                            placeholder="e.g. °C, %, ppm"
                            readOnly={isReadOnly}
                            value={String(selected.props.unit ?? "")}
                          />
                        </Field>
                        <Field label="Alert Threshold">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) =>
                              onUpdateItem(selected.id, { props: { threshold: Number(e.target.value) } })
                            }
                            placeholder="e.g. 50"
                            readOnly={isReadOnly}
                            type="number"
                            value={String(selected.props.threshold ?? "")}
                          />
                        </Field>
                        <Field label="Payload Format">
                          <Select
                            disabled={isReadOnly}
                            onValueChange={(value) => onUpdateItem(selected.id, { props: { payloadFormat: value } })}
                            value={String(selected.props.payloadFormat ?? "facilix")}
                          >
                            <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="facilix">Facilix</SelectItem>
                              <SelectItem value="thingsboard">ThingsBoard</SelectItem>
                              <SelectItem value="senml">SenML (RFC 8428)</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Poll Interval (s)">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) =>
                              onUpdateItem(selected.id, { props: { pollInterval: Number(e.target.value) } })
                            }
                            placeholder="e.g. 30"
                            readOnly={isReadOnly}
                            type="number"
                            value={String(selected.props.pollInterval ?? "")}
                          />
                        </Field>
                      </>
                    ) : (
                      <>
                        <Field label="Ingest Endpoint">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            placeholder="POST /api/sensors/ingest/{device_id}"
                            readOnly
                            value={`/api/sensors/ingest/${selected.id}`}
                          />
                        </Field>
                        <Field label="Payload Format">
                          <Select
                            disabled={isReadOnly}
                            onValueChange={(value) => onUpdateItem(selected.id, { props: { payloadFormat: value } })}
                            value={String(selected.props.payloadFormat ?? "facilix")}
                          >
                            <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                              <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="facilix">Facilix</SelectItem>
                              <SelectItem value="thingsboard">ThingsBoard</SelectItem>
                              <SelectItem value="senml">SenML (RFC 8428)</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Sensor Type">
                          <Select
                            disabled={isReadOnly}
                            onValueChange={(value) => onUpdateItem(selected.id, { props: { sensorType: value } })}
                            value={String(selected.props.sensorType ?? "")}
                          >
                            <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                              <SelectValue placeholder="Select sensor type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="temperature">Temperature</SelectItem>
                              <SelectItem value="humidity">Humidity</SelectItem>
                              <SelectItem value="pressure">Pressure</SelectItem>
                              <SelectItem value="air_quality">Air Quality</SelectItem>
                              <SelectItem value="vibration">Vibration</SelectItem>
                              <SelectItem value="motion">Motion</SelectItem>
                              <SelectItem value="leak">Leak</SelectItem>
                              <SelectItem value="light">Light</SelectItem>
                              <SelectItem value="door_contact">Door Contact</SelectItem>
                              <SelectItem value="battery">Battery</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Unit">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) => onUpdateItem(selected.id, { props: { unit: e.target.value } })}
                            placeholder="e.g. °C, %, ppm"
                            readOnly={isReadOnly}
                            value={String(selected.props.unit ?? "")}
                          />
                        </Field>
                        <Field label="Alert Threshold">
                          <Input
                            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                            onChange={(e) =>
                              onUpdateItem(selected.id, { props: { threshold: Number(e.target.value) } })
                            }
                            placeholder="e.g. 50"
                            readOnly={isReadOnly}
                            type="number"
                            value={String(selected.props.threshold ?? "")}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {selected.type === "Signal" && (
              <AccordionItem value="data-source">
                <AccordionTrigger>Data Source</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2">
                    <Field label="Device ID">
                      <Input
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                        onChange={(e) => onUpdateItem(selected.id, { props: { deviceId: e.target.value } })}
                        placeholder="e.g. gw-delta-03"
                        readOnly={isReadOnly}
                        value={String(selected.props.deviceId ?? "")}
                      />
                    </Field>
                    <Field label="Signal Strength">
                      <Input
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                        onChange={(e) => onUpdateItem(selected.id, { props: { strength: Number(e.target.value) } })}
                        placeholder="0–100 %"
                        readOnly={isReadOnly}
                        type="number"
                        value={String(selected.props.strength ?? "")}
                      />
                    </Field>
                    <Field label="Frequency (MHz)">
                      <Input
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                        onChange={(e) => onUpdateItem(selected.id, { props: { frequency: Number(e.target.value) } })}
                        placeholder="e.g. 2400"
                        readOnly={isReadOnly}
                        type="number"
                        value={String(selected.props.frequency ?? "")}
                      />
                    </Field>
                    <Field label="Protocol">
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(value) => onUpdateItem(selected.id, { props: { protocol: value } })}
                        value={String(selected.props.protocol ?? "")}
                      >
                        <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                          <SelectValue placeholder="Select protocol" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="wifi">Wi-Fi</SelectItem>
                          <SelectItem value="zigbee">Zigbee</SelectItem>
                          <SelectItem value="zwave">Z-Wave</SelectItem>
                          <SelectItem value="lorawan">LoRaWAN</SelectItem>
                          <SelectItem value="bluetooth">Bluetooth</SelectItem>
                          <SelectItem value="cellular">Cellular</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Host">
                      <Input
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                        onChange={(e) => onUpdateItem(selected.id, { props: { host: e.target.value } })}
                        placeholder="e.g. 192.168.1.1"
                        readOnly={isReadOnly}
                        value={String(selected.props.host ?? "")}
                      />
                    </Field>
                    <Field label="Port">
                      <Input
                        className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                        onChange={(e) => onUpdateItem(selected.id, { props: { port: Number(e.target.value) } })}
                        placeholder="e.g. 8080"
                        readOnly={isReadOnly}
                        type="number"
                        value={String(selected.props.port ?? "")}
                      />
                    </Field>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    </ScrollArea>
  );
}

/** Small wrapper for a labelled field row. */
function Field({
  label,
  noGrow,
  children,
  readOnly: _readOnly,
}: {
  label: string;
  readOnly?: boolean;
  noGrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={noGrow ? "flex flex-col gap-1" : "flex flex-col gap-1"}>
      <Label className="text-muted-foreground text-[11px] font-medium">{label}</Label>
      {children}
    </div>
  );
}

// ─── Anomaly Plugins section (CCTV) ────────────────────────────────────────

// ─── Intelligence Plugins section (CCTV) ───────────────────────────────────

/** Replace or remove a plugin entry inside the stored array. */
function updatePlugin(
  configs: DevicePluginConfig[],
  pluginId: string,
  patch: (current: DevicePluginConfig) => DevicePluginConfig,
): DevicePluginConfig[] {
  const idx = configs.findIndex((c) => c.pluginId === pluginId);
  if (idx === -1) return configs;
  return configs.map((c, i) => (i === idx ? patch(c) : c));
}

function removePlugin(configs: DevicePluginConfig[], pluginId: string): DevicePluginConfig[] {
  return configs.filter((c) => c.pluginId !== pluginId);
}

function addPlugin(configs: DevicePluginConfig[], plugin: Plugin): DevicePluginConfig[] {
  if (configs.some((c) => c.pluginId === plugin.id)) return configs;
  return [...configs, createPluginConfig(plugin)];
}

function CctvPluginsSection({
  configs,
  isReadOnly,
  onChange,
}: {
  configs: DevicePluginConfig[];
  isReadOnly: boolean;
  onChange: (next: DevicePluginConfig[]) => void;
}) {
  const installedIds = new Set(configs.map((c) => c.pluginId));
  const available = PLUGINS.filter((p) => !installedIds.has(p.id));

  return (
    <div className="flex flex-col gap-3">
      {isReadOnly && (
        <p className="bg-muted text-muted-foreground rounded-none px-2 py-1 text-[11px]">
          Read-only — switch to Edit to modify
        </p>
      )}

      {configs.length === 0 && (
        <div className="border-border bg-muted/20 text-muted-foreground flex flex-col items-start gap-1 rounded-none border border-dashed p-3 text-[11px]">
          <div className="text-foreground/70 flex items-center gap-1.5 font-medium">
            <ShieldAlertIcon className="size-3.5" />
            No intelligence plugins installed
          </div>
          <p className="text-muted-foreground/70 text-[10px] leading-snug">
            Add an operational plugin to protect an area, enforce compliance, monitor a loading bay, or spot safety
            risks.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {configs.map((config) => {
          const plugin = getPlugin(config.pluginId);
          if (!plugin) return null;
          return (
            <PluginCard
              config={config}
              isReadOnly={isReadOnly}
              key={config.pluginId}
              onChange={(patch) => onChange(updatePlugin(configs, config.pluginId, patch))}
              onRemove={() => onChange(removePlugin(configs, config.pluginId))}
              plugin={plugin}
            />
          );
        })}
      </div>

      {!isReadOnly && available.length > 0 && (
        <div className="border-border flex flex-col gap-1.5 border-t pt-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-muted-foreground text-[11px] font-medium">Add operational plugin</Label>
            <span className="text-muted-foreground/50 font-mono text-[9px] uppercase">Outcome catalog</span>
          </div>
          <div className="flex flex-col gap-1">
            {available.map((plugin) => (
              <Button
                className="h-auto justify-between rounded-none px-2 py-1.5 text-left"
                key={plugin.id}
                onClick={() => onChange(addPlugin(configs, plugin))}
                size="sm"
                variant="outline"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-foreground/80 text-[11px] font-medium">{plugin.name}</span>
                    <span className="bg-muted text-muted-foreground rounded-sm px-1 py-0.5 font-mono text-[8px] uppercase">
                      {plugin.category}
                    </span>
                  </span>
                  <span className="text-muted-foreground/70 text-[10px] font-normal">{plugin.description}</span>
                  <span className="text-muted-foreground/50 truncate text-[9px] font-normal">
                    Best for: {plugin.recommendedFor.join(" · ")}
                  </span>
                </span>
                <PlusIcon className="text-muted-foreground size-3.5" />
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PluginCard({
  plugin,
  config,
  isReadOnly,
  onChange,
  onRemove,
}: {
  plugin: Plugin;
  config: DevicePluginConfig;
  isReadOnly: boolean;
  onChange: (patch: (current: DevicePluginConfig) => DevicePluginConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border-border bg-muted/10 flex flex-col gap-2 rounded-none border p-2">
      <div className="border-border bg-muted/30 text-muted-foreground -mx-2 -mt-2 flex items-center justify-between border-b px-2 py-1 font-mono text-[8px] tracking-wider uppercase">
        <span>{plugin.category}</span>
        <span>{plugin.kind === "segment-understanding" ? "Roboflow + vision review" : "Roboflow workflow"}</span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldAlertIcon className="text-foreground/70 size-3.5" />
            <p className="text-foreground/90 truncate text-[11px] font-medium">{plugin.name}</p>
          </div>
          <p className="text-muted-foreground/70 mt-0.5 text-[10px] leading-snug">{plugin.description}</p>
        </div>
        <div className="flex items-center gap-1">
          {!isReadOnly && (
            <Button
              aria-label={`Remove ${plugin.name}`}
              className="text-muted-foreground/70 hover:text-destructive"
              onClick={onRemove}
              size="icon-xs"
              variant="ghost"
            >
              <XIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-y py-2">
        <div className="min-w-0">
          <p className="text-muted-foreground/50 font-mono text-[8px] tracking-wider uppercase">Watches</p>
          <p className="text-foreground/70 mt-0.5 text-[9px] leading-snug">{plugin.watchFor.join(" · ")}</p>
        </div>
        <div className="min-w-0 border-l pl-2">
          <p className="text-muted-foreground/50 font-mono text-[8px] tracking-wider uppercase">Alerts when</p>
          <p className="text-foreground/70 mt-0.5 text-[9px] leading-snug">{plugin.alertsWhen.join(" · ")}</p>
        </div>
      </div>

      {/* Enable switch */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground/80 text-[11px] font-medium">Enabled</p>
          <p className="text-muted-foreground/60 text-[10px]">Run analysis and raise alerts.</p>
        </div>
        <Switch
          aria-label={`Enable ${plugin.name}`}
          checked={config.enabled}
          disabled={isReadOnly}
          onCheckedChange={(checked) => onChange((c) => ({ ...c, enabled: checked }))}
          size="sm"
        />
      </div>

      <WorkflowInputConfig config={config} isReadOnly={isReadOnly} onChange={onChange} plugin={plugin} />

      {plugin.kind === "segment-understanding" && config.kind === "segment-understanding" && (
        <SegmentAnalysisConfig config={config} isReadOnly={isReadOnly} onChange={onChange} />
      )}

      {plugin.kind === "workflow-object-detection" && config.kind === "workflow-object-detection" && (
        <DetectionPluginConfig config={config} isReadOnly={isReadOnly} onChange={onChange} />
      )}

      <div className="border-border flex flex-col gap-2 border-t pt-2">
        <div>
          <p className="text-foreground/80 text-[11px] font-medium">Event evidence</p>
          <p className="text-muted-foreground/60 text-[10px]">
            Attach reviewable evidence when this plugin raises an alert.
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-[10px]">Source video clip</span>
          <Switch
            aria-label={`Attach video for ${plugin.name}`}
            checked={config.evidence.attachVideo}
            disabled={isReadOnly}
            onCheckedChange={(checked) =>
              onChange((current) => ({
                ...current,
                evidence: { ...current.evidence, attachVideo: checked },
              }))
            }
            size="sm"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-[10px]">Annotated frames</span>
          <Switch
            aria-label={`Attach annotated frames for ${plugin.name}`}
            checked={config.evidence.attachAnnotatedFrames}
            disabled={isReadOnly}
            onCheckedChange={(checked) =>
              onChange((current) => ({
                ...current,
                evidence: { ...current.evidence, attachAnnotatedFrames: checked },
              }))
            }
            size="sm"
          />
        </div>
        {config.evidence.attachAnnotatedFrames && (
          <Field label="Maximum annotated images">
            <Input
              className={isReadOnly ? "pointer-events-none opacity-60" : ""}
              max={3}
              min={1}
              onChange={(event) => {
                const value = Number(event.target.value);
                onChange((current) => ({
                  ...current,
                  evidence: {
                    ...current.evidence,
                    maxAnnotatedFrames: Number.isFinite(value) ? Math.max(1, Math.min(3, value)) : 3,
                  },
                }));
              }}
              readOnly={isReadOnly}
              type="number"
              value={String(config.evidence.maxAnnotatedFrames)}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function WorkflowInputConfig({
  plugin,
  config,
  isReadOnly,
  onChange,
}: {
  plugin: Plugin;
  config: DevicePluginConfig;
  isReadOnly: boolean;
  onChange: (patch: (current: DevicePluginConfig) => DevicePluginConfig) => void;
}) {
  return (
    <div className="border-border flex flex-col gap-2 border-t pt-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Roboflow workflow">
          <Input className="font-mono text-[10px]" readOnly value={plugin.workflow.workflowId} />
        </Field>
        <Field label="Detection confidence">
          <Input
            className={isReadOnly ? "pointer-events-none opacity-60" : ""}
            max={1}
            min={0}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChange((current) => ({
                ...current,
                minConfidence: Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_PLUGIN_CONFIDENCE,
              }));
            }}
            readOnly={isReadOnly}
            step={0.05}
            type="number"
            value={String(config.minConfidence)}
          />
        </Field>
      </div>
      <Field label="Objects to monitor">
        <Input
          className={isReadOnly ? "pointer-events-none opacity-60" : ""}
          onChange={(event) => {
            const value = event.target.value.trim();
            const classes = value
              ? value
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean)
              : undefined;
            onChange((current) => ({ ...current, classes }));
          }}
          placeholder="All workflow labels"
          readOnly={isReadOnly}
          value={config.classes?.join(", ") ?? ""}
        />
      </Field>
      <p className="text-muted-foreground/60 text-[10px]">
        Plugins sharing this workflow reuse one inference pass. Results are filtered per plugin afterward.
      </p>
    </div>
  );
}

// ── Segment-Analysis Config Form ──────────────────────────────────────

function SegmentAnalysisConfig({
  config,
  isReadOnly,
  onChange,
}: {
  config: SegmentAnalysisDeviceConfig;
  isReadOnly: boolean;
  onChange: (patch: (current: DevicePluginConfig) => DevicePluginConfig) => void;
}) {
  const alerts = config.alerts ?? [];

  function updateAlert(index: number, patch: (alert: SceneAlertRule) => SceneAlertRule) {
    onChange((c) => {
      const curr = c as SegmentAnalysisDeviceConfig;
      const newAlerts = curr.alerts.map((a, i) => (i === index ? patch(a) : a));
      return { ...curr, alerts: newAlerts };
    });
  }

  function removeAlert(index: number) {
    onChange((c) => {
      const curr = c as SegmentAnalysisDeviceConfig;
      return { ...curr, alerts: curr.alerts.filter((_, i) => i !== index) };
    });
  }

  function addAlert() {
    onChange((c) => {
      const curr = c as SegmentAnalysisDeviceConfig;
      const newAlert: SceneMatchAlertRule = {
        kind: "scene-match",
        enabled: true,
        description: "",
        severity: "warn",
      };
      return { ...curr, alerts: [...curr.alerts, newAlert] };
    });
  }

  return (
    <>
      {/* Legacy Prompt */}
      <div className="border-border flex flex-col gap-1.5 border-t pt-2">
        <Label className="text-muted-foreground text-[11px] font-medium">Review guidance</Label>
        <textarea
          className={`border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 dark:bg-input/30 dark:disabled:bg-input/80 h-20 w-full min-w-0 resize-none rounded-none border bg-transparent px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs ${
            isReadOnly ? "pointer-events-none opacity-60" : ""
          }`}
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((c) => ({
              ...(c as SegmentAnalysisDeviceConfig),
              prompt: e.target.value,
            }))
          }
          placeholder="Describe what anomalies to look for in this CCTV feed..."
          value={config.prompt}
        />
        <p className="text-muted-foreground/60 text-[10px]">Guidance used when reviewing each recorded segment.</p>
      </div>

      {/* Scene Alert Rules */}
      <div className="border-border flex flex-col gap-2 border-t pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground text-[11px] font-medium">Operational rules</Label>
          {!isReadOnly && (
            <Button className="h-5 px-1.5 text-[10px]" onClick={addAlert} size="sm" variant="outline">
              <PlusIcon className="mr-0.5 size-2.5" />
              Add rule
            </Button>
          )}
        </div>

        {alerts.length === 0 && (
          <p className="text-muted-foreground/60 text-[10px]">No operational rules configured.</p>
        )}

        {alerts.map((alert, index) => (
          <div className="bg-muted/20 flex flex-col gap-1.5 rounded-none border p-2" key={index}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  aria-label={`Enable scene alert ${index + 1}`}
                  checked={alert.enabled}
                  disabled={isReadOnly}
                  onCheckedChange={(checked) => updateAlert(index, (a) => ({ ...a, enabled: checked }))}
                  size="sm"
                />
                <span className="text-foreground/80 text-[10px] font-medium">Risk condition</span>
              </div>
              {!isReadOnly && (
                <Button
                  className="text-muted-foreground/70 hover:text-destructive"
                  onClick={() => removeAlert(index)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>

            <textarea
              className={`border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 dark:bg-input/30 dark:disabled:bg-input/80 h-16 w-full min-w-0 resize-none rounded-none border bg-transparent px-2 py-1 text-[10px] transition-colors outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ${
                isReadOnly ? "pointer-events-none opacity-60" : ""
              }`}
              disabled={isReadOnly}
              onChange={(e) => updateAlert(index, (a) => ({ ...a, description: e.target.value }))}
              placeholder="Describe a visible condition that should trigger an alert..."
              value={alert.kind === "scene-match" ? alert.description : ""}
            />

            <div className="flex items-center gap-2">
              <select
                className="border-input bg-muted/30 text-foreground/80 h-6 flex-1 rounded-none border px-1.5 text-[10px] disabled:opacity-60"
                disabled={isReadOnly}
                onChange={(e) =>
                  updateAlert(index, (a) => ({
                    ...a,
                    severity: e.target.value as import("#/lib/monitoring/plugins").AlertSeverity,
                  }))
                }
                value={alert.severity}
              >
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* Legacy Severity */}
      <div className="border-border flex flex-col gap-1.5 border-t pt-2">
        <Label className="text-muted-foreground text-[11px] font-medium">Default severity</Label>
        <select
          className="border-input bg-muted/30 text-foreground/80 h-8 rounded-none border px-2 text-xs disabled:opacity-60"
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((c) => ({
              ...(c as SegmentAnalysisDeviceConfig),
              severity: e.target.value as SegmentAnalysisDeviceConfig["severity"],
            }))
          }
          value={config.severity}
        >
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
      </div>
    </>
  );
}

// ── Workflow Object Detection Config Form ──────────────────────────────

function DetectionPluginConfig({
  config,
  isReadOnly,
  onChange,
}: {
  config: WorkflowObjectDetectionDeviceConfig;
  isReadOnly: boolean;
  onChange: (patch: (current: DevicePluginConfig) => DevicePluginConfig) => void;
}) {
  const alerts = config.alerts ?? [];

  function updateAlert(index: number, patch: (alert: DetectionAlertRule) => DetectionAlertRule) {
    onChange((c) => {
      const curr = c as WorkflowObjectDetectionDeviceConfig;
      const newAlerts = curr.alerts.map((a, i) => (i === index ? patch(a) : a));
      return { ...curr, alerts: newAlerts };
    });
  }

  function removeAlert(index: number) {
    onChange((c) => {
      const curr = c as WorkflowObjectDetectionDeviceConfig;
      return { ...curr, alerts: curr.alerts.filter((_, i) => i !== index) };
    });
  }

  function addAlert(kind: "count-threshold" | "object-enters" | "object-leaves") {
    onChange((c) => {
      const curr = c as WorkflowObjectDetectionDeviceConfig;
      let newAlert: DetectionAlertRule;
      if (kind === "count-threshold") {
        newAlert = {
          kind: "count-threshold",
          enabled: true,
          threshold: DEFAULT_COUNTING_THRESHOLD,
          operator: DEFAULT_COUNTING_OPERATOR,
          thresholdMode: "max-per-frame",
          severity: "warn",
        };
      } else if (kind === "object-enters") {
        newAlert = { kind: "object-enters", enabled: true, severity: "warn" };
      } else {
        newAlert = { kind: "object-leaves", enabled: true, severity: "warn" };
      }
      return { ...curr, alerts: [...curr.alerts, newAlert] };
    });
  }

  return (
    <>
      {/* Alert Rules */}
      <div className="border-border flex flex-col gap-2 border-t pt-2">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground text-[11px] font-medium">Operational rules</Label>
          {!isReadOnly && (
            <div className="flex gap-1">
              <Button
                className="h-5 px-1.5 text-[10px]"
                onClick={() => addAlert("count-threshold")}
                size="sm"
                variant="outline"
              >
                <PlusIcon className="mr-0.5 size-2.5" />
                Limit
              </Button>
              <Button
                className="h-5 px-1.5 text-[10px]"
                onClick={() => addAlert("object-enters")}
                size="sm"
                variant="outline"
              >
                <PlusIcon className="mr-0.5 size-2.5" />
                Arrives
              </Button>
              <Button
                className="h-5 px-1.5 text-[10px]"
                onClick={() => addAlert("object-leaves")}
                size="sm"
                variant="outline"
              >
                <PlusIcon className="mr-0.5 size-2.5" />
                Leaves
              </Button>
            </div>
          )}
        </div>

        {alerts.length === 0 && (
          <p className="text-muted-foreground/60 text-[10px]">No operational rules configured.</p>
        )}

        {alerts.map((alert, index) => (
          <div className="bg-muted/20 flex flex-col gap-1.5 rounded-none border p-2" key={index}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  aria-label={`Enable alert ${index + 1}`}
                  checked={alert.enabled}
                  disabled={isReadOnly}
                  onCheckedChange={(checked) => updateAlert(index, (a) => ({ ...a, enabled: checked }))}
                  size="sm"
                />
                <span className="text-foreground/80 text-[10px] font-medium">
                  {alert.kind === "count-threshold" && "Occupancy limit"}
                  {alert.kind === "object-enters" && "Arrival or entry"}
                  {alert.kind === "object-leaves" && "Departure or exit"}
                </span>
              </div>
              {!isReadOnly && (
                <Button
                  className="text-muted-foreground/70 hover:text-destructive"
                  onClick={() => removeAlert(index)}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>

            {alert.kind === "count-threshold" && (
              <CountThresholdAlertFields
                alert={alert}
                isReadOnly={isReadOnly}
                onChange={(patch) => updateAlert(index, (a) => patch(a as DetectionAlertRule))}
              />
            )}

            {(alert.kind === "object-enters" || alert.kind === "object-leaves") && (
              <TransitionAlertFields
                alert={alert}
                isReadOnly={isReadOnly}
                onChange={(patch) => updateAlert(index, (a) => patch(a as DetectionAlertRule))}
              />
            )}
          </div>
        ))}
      </div>

      {/* Cooldown */}
      <div className="border-border flex flex-col gap-1 border-t pt-2">
        <Label className="text-muted-foreground text-[11px] font-medium">Cooldown (seconds)</Label>
        <Input
          className={isReadOnly ? "pointer-events-none opacity-60" : ""}
          max={3600}
          min={0}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange((c) => ({
              ...(c as WorkflowObjectDetectionDeviceConfig),
              cooldownSec: Number.isFinite(v) && v >= 0 ? v : undefined,
            }));
          }}
          readOnly={isReadOnly}
          type="number"
          value={String(config.cooldownSec ?? "")}
        />
        <p className="text-muted-foreground/60 text-[10px]">
          Minimum seconds between alerts for this plugin. Leave empty for no cooldown.
        </p>
      </div>
    </>
  );
}

function CountThresholdAlertFields({
  alert,
  isReadOnly,
  onChange,
}: {
  alert: CountThresholdAlertRule;
  isReadOnly: boolean;
  onChange: (patch: (alert: DetectionAlertRule) => DetectionAlertRule) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <select
          className="border-input bg-muted/30 text-foreground/80 h-7 rounded-none border px-1.5 text-[10px] disabled:opacity-60"
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((a) => ({
              ...a,
              operator: e.target.value as ComparisonOperator,
            }))
          }
          value={alert.operator}
        >
          <option value="gt">&gt;</option>
          <option value="gte">&ge;</option>
          <option value="lt">&lt;</option>
          <option value="lte">&le;</option>
          <option value="eq">=</option>
        </select>
        <Input
          className={isReadOnly ? "pointer-events-none flex-1 opacity-60" : "flex-1"}
          max={10000}
          min={0}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange((a) => ({
              ...a,
              threshold: Number.isFinite(v) ? v : DEFAULT_COUNTING_THRESHOLD,
            }));
          }}
          readOnly={isReadOnly}
          type="number"
          value={String(alert.threshold)}
        />
      </div>
      <div className="flex items-center gap-2">
        <select
          className="border-input bg-muted/30 text-foreground/80 h-7 flex-1 rounded-none border px-1.5 text-[10px] disabled:opacity-60"
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((a) => ({
              ...a,
              thresholdMode: e.target.value as ThresholdMode,
            }))
          }
          value={alert.thresholdMode}
        >
          <option value="max-per-frame">Max per frame</option>
          <option value="total-detections">Total detections</option>
          <option value="unique-tracks">Unique tracks</option>
        </select>
        <select
          className="border-input bg-muted/30 text-foreground/80 h-7 rounded-none border px-1.5 text-[10px] disabled:opacity-60"
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((a) => ({
              ...a,
              severity: e.target.value as import("#/lib/monitoring/plugins").AlertSeverity,
            }))
          }
          value={alert.severity}
        >
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>
    </>
  );
}

function TransitionAlertFields({
  alert,
  isReadOnly,
  onChange,
}: {
  alert: DetectionAlertRule;
  isReadOnly: boolean;
  onChange: (patch: (alert: DetectionAlertRule) => DetectionAlertRule) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        className={isReadOnly ? "pointer-events-none flex-1 opacity-60" : "flex-1"}
        onChange={(e) => {
          const val = e.target.value.trim();
          const labels =
            val.length > 0
              ? val
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined;
          onChange((a) => ({
            ...a,
            labels,
          }));
        }}
        readOnly={isReadOnly}
        placeholder="Labels (optional, comma-separated)"
        value={"labels" in alert && alert.labels ? alert.labels.join(", ") : ""}
      />
      <select
        className="border-input bg-muted/30 text-foreground/80 h-7 rounded-none border px-1.5 text-[10px] disabled:opacity-60"
        disabled={isReadOnly}
        onChange={(e) =>
          onChange((a) => ({
            ...a,
            severity: e.target.value as import("#/lib/monitoring/plugins").AlertSeverity,
          }))
        }
        value={alert.severity}
      >
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>
    </div>
  );
}
