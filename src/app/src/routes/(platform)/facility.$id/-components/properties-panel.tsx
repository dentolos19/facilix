import { PlusIcon, ShieldAlertIcon, Trash2, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import {
  DEFAULT_COUNTING_OPERATOR,
  DEFAULT_COUNTING_THRESHOLD,
  DEFAULT_PLUGIN_CONFIDENCE,
  type DevicePluginConfig,
  getPlugin,
  normalizePlugins,
  PLUGINS,
  type Plugin,
  type SegmentAnalysisDeviceConfig,
  type WorkflowObjectDetectionDeviceConfig,
} from "#/lib/monitoring/plugins";
import type { SimulationStream } from "#/lib/simulation/cctv";
import { fetchSimulationStreams } from "#/lib/simulation/cctv";
import { FALLBACK_SIMULATION_SENSORS } from "#/lib/simulation/sensors";
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
  useEffect(() => {
    let ignore = false;
    fetchSimulationStreams().then((streams) => {
      if (!ignore) setFetchedStreams(streams);
    });
    return () => {
      ignore = true;
    };
  }, []);

  // Only use streams fetched live from the simulator (no static fallbacks)
  const allStreams = fetchedStreams;

  // Auto-select first available stream if current selection is empty
  useEffect(() => {
    if (!selected || selected.type !== "CCTV" || isReadOnly) return;
    const currentStream = String(selected.props.simulationStream ?? "");
    if (!currentStream && allStreams.length > 0) {
      onUpdateItem(selected.id, {
        props: { simulationStream: allStreams[0].name },
      });
    }
  }, [selected?.id, allStreams.length]);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col p-4">
        {/* ── Header with title and delete button ── */}
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="font-heading font-medium text-muted-foreground text-xs uppercase tracking-wider">
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
            <span className="text-[11px] text-muted-foreground/50">
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
                    <p className="rounded-none bg-muted px-2 py-1 text-[11px] text-muted-foreground">
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
                    <div className="flex h-8 items-center rounded-none border border-input bg-muted/30 px-2.5 text-muted-foreground text-xs">
                      {selected.type}
                    </div>
                  </Field>

                  {selected.type !== "Zone" && (
                    <Field label="Zone">
                      <div className="flex h-8 items-center rounded-none border border-input bg-muted/30 px-2.5 text-muted-foreground text-xs">
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
                      className={`h-16 w-full min-w-0 resize-none rounded-none border border-input bg-transparent px-2.5 py-1 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}
                      onChange={(e) => onUpdateItem(selected.id, { notes: e.target.value })}
                      readOnly={isReadOnly}
                      rows={3}
                      value={selected.notes}
                    />
                  </Field>

                  <Field label="Icon Color">
                    <div className="flex gap-2">
                      <input
                        className="h-8 w-10 cursor-pointer rounded-none border border-input bg-transparent p-0.5 disabled:pointer-events-none disabled:opacity-60"
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
                          <Select
                            disabled={isReadOnly}
                            onValueChange={(value) => onUpdateItem(selected.id, { props: { simulationStream: value } })}
                            value={String(selected.props.simulationStream ?? "")}
                          >
                            <SelectTrigger className={`w-full ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
                              <SelectValue placeholder="Select a video file" />
                            </SelectTrigger>
                            <SelectContent>
                              {allStreams.map((s) => (
                                <SelectItem key={s.name} value={s.name}>
                                  {s.label ?? s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                          <Select
                            disabled={isReadOnly}
                            onValueChange={(value) => {
                              const device = FALLBACK_SIMULATION_SENSORS.find((s) => s.deviceId === value);
                              onUpdateItem(selected.id, {
                                props: {
                                  simulationDeviceId: value,
                                  sensorType: device?.sensorType ?? "",
                                },
                              });
                            }}
                            value={String(selected.props.simulationDeviceId ?? "")}
                          >
                            <SelectTrigger className={`w-full ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
                              <SelectValue placeholder="Select a sensor device" />
                            </SelectTrigger>
                            <SelectContent>
                              {FALLBACK_SIMULATION_SENSORS.map((s) => (
                                <SelectItem key={s.deviceId} value={s.deviceId}>
                                  {s.label}
                                </SelectItem>
                              ))}
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
      <Label className="font-medium text-[11px] text-muted-foreground">{label}</Label>
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

  if (plugin.kind === "segment-understanding") {
    return [
      ...configs,
      {
        pluginId: plugin.id,
        enabled: true,
        prompt: plugin.defaultPrompt ?? "Analyze this CCTV clip for anomalies.",
        severity: "warn",
      },
    ];
  }

  if (plugin.kind === "workflow-object-detection") {
    return [
      ...configs,
      {
        pluginId: plugin.id,
        enabled: true,
        threshold: DEFAULT_COUNTING_THRESHOLD,
        operator: DEFAULT_COUNTING_OPERATOR,
        thresholdMode: "max-per-frame",
        minConfidence: DEFAULT_PLUGIN_CONFIDENCE,
        alertSeverity: "warn",
        cooldownSec: 300,
      },
    ];
  }

  return configs;
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
        <p className="rounded-none bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          Read-only — switch to Edit to modify
        </p>
      )}

      {configs.length === 0 && (
        <div className="flex flex-col items-start gap-1 rounded-none border border-border border-dashed bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground/70">
            <ShieldAlertIcon className="size-3.5" />
            No intelligence plugins installed
          </div>
          <p className="text-[10px] text-muted-foreground/70 leading-snug">
            Object detection runs automatically on every video segment. Add a Natural Language plugin for AI scene
            understanding.
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
        <div className="flex flex-col gap-1.5 border-border border-t pt-2">
          <Label className="font-medium text-[11px] text-muted-foreground">Add Plugin</Label>
          <div className="flex flex-col gap-1">
            {available.map((plugin) => (
              <Button
                className="h-auto justify-between rounded-none px-2 py-1.5 text-left"
                key={plugin.id}
                onClick={() => onChange(addPlugin(configs, plugin))}
                size="sm"
                variant="outline"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-[11px] text-foreground/80">{plugin.name}</span>
                  <span className="font-normal text-[10px] text-muted-foreground/70">{plugin.description}</span>
                </span>
                <PlusIcon className="size-3.5 text-muted-foreground" />
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
    <div className="flex flex-col gap-2 rounded-none border border-border bg-muted/10 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldAlertIcon className="size-3.5 text-foreground/70" />
            <p className="truncate font-medium text-[11px] text-foreground/90">{plugin.name}</p>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground/70 leading-snug">{plugin.description}</p>
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

      {/* Enable switch */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-[11px] text-foreground/80">Enabled</p>
          <p className="text-[10px] text-muted-foreground/60">Run analysis and raise alerts.</p>
        </div>
        <Switch
          aria-label={`Enable ${plugin.name}`}
          checked={config.enabled}
          disabled={isReadOnly}
          onCheckedChange={(checked) => onChange((c) => ({ ...c, enabled: checked }))}
          size="sm"
        />
      </div>

      {plugin.kind === "segment-understanding" && (
        <SegmentAnalysisConfig
          config={config as SegmentAnalysisDeviceConfig}
          isReadOnly={isReadOnly}
          onChange={onChange}
        />
      )}

      {plugin.kind === "workflow-object-detection" && (
        <DetectionPluginConfig
          config={config as WorkflowObjectDetectionDeviceConfig}
          isReadOnly={isReadOnly}
          onChange={onChange}
        />
      )}
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
  return (
    <>
      <div className="flex flex-col gap-1.5 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Prompt</Label>
        <textarea
          className={`h-20 w-full min-w-0 resize-none rounded-none border border-input bg-transparent px-2.5 py-1 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 ${
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
        <p className="text-[10px] text-muted-foreground/60">
          Prompt is sent to AI video understanding on segment upload.
        </p>
      </div>

      <div className="flex flex-col gap-1.5 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Alert severity</Label>
        <select
          className="h-8 rounded-none border border-input bg-muted/30 px-2 text-foreground/80 text-xs disabled:opacity-60"
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
  return (
    <>
      {/* Threshold */}
      <div className="flex flex-col gap-1.5 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Alert threshold</Label>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-none border border-input bg-muted/30 px-2 text-foreground/80 text-xs disabled:opacity-60"
            disabled={isReadOnly}
            onChange={(e) =>
              onChange((c) => ({
                ...(c as WorkflowObjectDetectionDeviceConfig),
                operator: e.target.value as WorkflowObjectDetectionDeviceConfig["operator"],
              }))
            }
            value={config.operator}
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
              onChange((c) => ({
                ...(c as WorkflowObjectDetectionDeviceConfig),
                threshold: Number.isFinite(v) ? v : DEFAULT_COUNTING_THRESHOLD,
              }));
            }}
            readOnly={isReadOnly}
            type="number"
            value={String(config.threshold)}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/60">Alert when detection count crosses this value.</p>
      </div>

      {/* Threshold Mode */}
      <div className="flex flex-col gap-1.5 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Counting mode</Label>
        <select
          className="h-8 rounded-none border border-input bg-muted/30 px-2 text-foreground/80 text-xs disabled:opacity-60"
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((c) => ({
              ...(c as WorkflowObjectDetectionDeviceConfig),
              thresholdMode: e.target.value as WorkflowObjectDetectionDeviceConfig["thresholdMode"],
            }))
          }
          value={config.thresholdMode}
        >
          <option value="max-per-frame">Max per frame</option>
          <option value="total-detections">Total detections</option>
          <option value="unique-tracks">Unique tracks</option>
        </select>
        <p className="text-[10px] text-muted-foreground/60">
          {config.thresholdMode === "max-per-frame" && "Alert if any single frame exceeds the threshold."}
          {config.thresholdMode === "total-detections" &&
            "Alert if total detections in the segment exceeds the threshold."}
          {config.thresholdMode === "unique-tracks" && "Alert if unique tracked objects exceeds the threshold."}
        </p>
      </div>

      {/* Minimum Confidence */}
      <div className="flex flex-col gap-1 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Minimum confidence</Label>
        <Input
          className={isReadOnly ? "pointer-events-none opacity-60" : ""}
          max={1}
          min={0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange((c) => ({
              ...(c as WorkflowObjectDetectionDeviceConfig),
              minConfidence: Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_PLUGIN_CONFIDENCE,
            }));
          }}
          readOnly={isReadOnly}
          step={0.05}
          type="number"
          value={String(config.minConfidence)}
        />
        <p className="text-[10px] text-muted-foreground/60">
          0–1 (lower = more sensitive). Detections below this are ignored.
        </p>
      </div>

      {/* Alert Severity */}
      <div className="flex flex-col gap-1.5 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Alert severity</Label>
        <select
          className="h-8 rounded-none border border-input bg-muted/30 px-2 text-foreground/80 text-xs disabled:opacity-60"
          disabled={isReadOnly}
          onChange={(e) =>
            onChange((c) => ({
              ...(c as WorkflowObjectDetectionDeviceConfig),
              alertSeverity: e.target.value as WorkflowObjectDetectionDeviceConfig["alertSeverity"],
            }))
          }
          value={config.alertSeverity}
        >
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* Cooldown */}
      <div className="flex flex-col gap-1 border-border border-t pt-2">
        <Label className="font-medium text-[11px] text-muted-foreground">Cooldown (seconds)</Label>
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
        <p className="text-[10px] text-muted-foreground/60">
          Minimum seconds between alerts for this plugin. Leave empty for no cooldown.
        </p>
      </div>
    </>
  );
}
