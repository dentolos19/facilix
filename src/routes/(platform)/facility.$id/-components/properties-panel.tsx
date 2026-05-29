import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select.tsx";
import { Trash2 } from "lucide-react";
import type { PlacedItem } from "#/lib/types";
import { DEFAULT_ICON_SHAPES, ICON_SHAPE_OPTIONS } from "#/lib/types";
import type { PropertiesPanelProps } from "../-helpers/types";

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
  const isReadOnly = editMode === "monitor";

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {/* ── Header with title and delete button ── */}
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Properties
        </h3>
        {selected && editMode === "edit" && (
          <Button
            aria-label="Delete component"
            onClick={() => onDeleteItem(selected.id)}
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {!selected && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 text-center">
          <span className="text-[11px] text-muted-foreground/50">
            {editMode === "monitor"
              ? "Switch to Edit mode to select components"
              : "Click a component on the canvas to view its properties"}
          </span>
        </div>
      )}

      {selected && (
        <Accordion className="flex-1" defaultValue={["basic-info", "data-source"]} type="multiple">
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
                  <div className="flex h-8 items-center rounded-none border border-input bg-muted/30 px-2.5 text-xs text-muted-foreground">
                    {selected.type}
                  </div>
                </Field>

                <Field label="Position" noGrow>
                  <div className="flex gap-2">
                    <Input
                      className="w-1/2 pointer-events-none opacity-60"
                      readOnly
                      tabIndex={-1}
                      value={Math.round(selected.x)}
                    />
                    <Input
                      className="w-1/2 pointer-events-none opacity-60"
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
                        className={isReadOnly ? "w-1/2 pointer-events-none opacity-60" : "w-1/2"}
                        onChange={(e) => onUpdateLayout(selected.id, { width: Math.max(10, Number(e.target.value)) })}
                        readOnly={isReadOnly}
                        type="number"
                        value={selected.width}
                      />
                      <Input
                        className={isReadOnly ? "w-1/2 pointer-events-none opacity-60" : "w-1/2"}
                        onChange={(e) => onUpdateLayout(selected.id, { height: Math.max(10, Number(e.target.value)) })}
                        readOnly={isReadOnly}
                        type="number"
                        value={selected.height}
                      />
                    </div>
                  </Field>
                )}

                <Field label="Notes" noGrow>
                  <textarea
                    className={`h-16 w-full min-w-0 resize-none rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}
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
                      className={isReadOnly ? "flex-1 pointer-events-none opacity-60" : "flex-1"}
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
                    <Field label="Simulation Type">
                      <Select
                        disabled={isReadOnly}
                        onValueChange={(value) => onUpdateItem(selected.id, { props: { simulationType: value } })}
                        value={String(selected.props.simulationType ?? "ai-motion")}
                      >
                        <SelectTrigger className={`w-full ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}>
                          <SelectValue placeholder="Select simulation type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ai-motion">AI Motion Detection</SelectItem>
                          <SelectItem value="object-detection">Object Detection</SelectItem>
                          <SelectItem value="line-crossing">Line Crossing</SelectItem>
                          <SelectItem value="zone-intrusion">Zone Intrusion</SelectItem>
                          <SelectItem value="loitering">Loitering</SelectItem>
                          <SelectItem value="people-counting">People Counting</SelectItem>
                          <SelectItem value="tampering">Tampering Detection</SelectItem>
                          <SelectItem value="lpr">License Plate Recognition</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
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

          {selected.type === "Sensor" && (
            <AccordionItem value="data-source">
              <AccordionTrigger>Data Source</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <Field label="Device ID">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { deviceId: e.target.value } })}
                      placeholder="e.g. sensor-temp-02"
                      readOnly={isReadOnly}
                      value={String(selected.props.deviceId ?? "")}
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
                        <SelectItem value="air-quality">Air Quality</SelectItem>
                        <SelectItem value="vibration">Vibration</SelectItem>
                        <SelectItem value="motion">Motion</SelectItem>
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
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
                      onChange={(e) => onUpdateItem(selected.id, { props: { threshold: Number(e.target.value) } })}
                      placeholder="e.g. 50"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.threshold ?? "")}
                    />
                  </Field>
                  <Field label="Host / Broker">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { host: e.target.value } })}
                      placeholder="e.g. mqtt.internal:1883"
                      readOnly={isReadOnly}
                      value={String(selected.props.host ?? "")}
                    />
                  </Field>
                  <Field label="Topic / Path">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { topic: e.target.value } })}
                      placeholder="e.g. /warehouse/sensors/temperature"
                      readOnly={isReadOnly}
                      value={String(selected.props.topic ?? "")}
                    />
                  </Field>
                  <Field label="Poll Interval (s)">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { pollInterval: Number(e.target.value) } })}
                      placeholder="e.g. 30"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.pollInterval ?? "")}
                    />
                  </Field>
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
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
