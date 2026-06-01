// ─── Domain types for the facility editor ─────────────────────────────────
// (merged from src/lib/types.ts)

export type PlacedItemType = "Zone" | "Marker" | "CCTV" | "Sensor" | "Signal";

/** Available icon shapes per component type. */
export type MarkerShape = "diamond" | "pin" | "star" | "flag" | "circle";
export type CctvShape = "camera" | "eye" | "video" | "monitor";
export type SensorShape = "wifi" | "thermometer" | "droplet" | "wind" | "activity" | "sun";
export type SignalShape = "exclamation" | "antenna" | "signal-bars" | "satellite";

export type IconShape = MarkerShape | CctvShape | SensorShape | SignalShape;

/** Default icon shape for each component type. */
export const DEFAULT_ICON_SHAPES: Record<PlacedItemType, IconShape> = {
  Zone: "diamond", // unused for zones but needed for type completeness
  Marker: "diamond",
  CCTV: "camera",
  Sensor: "wifi",
  Signal: "exclamation",
};

/** Available icon shapes for each non-zone component type. */
export const ICON_SHAPE_OPTIONS: Record<string, { value: IconShape; label: string }[]> = {
  Marker: [
    { value: "diamond", label: "Diamond" },
    { value: "pin", label: "Pin" },
    { value: "star", label: "Star" },
    { value: "flag", label: "Flag" },
    { value: "circle", label: "Circle" },
  ],
  CCTV: [
    { value: "camera", label: "Camera" },
    { value: "eye", label: "Eye" },
    { value: "video", label: "Video" },
    { value: "monitor", label: "Monitor" },
  ],
  Sensor: [
    { value: "wifi", label: "Wi-Fi" },
    { value: "thermometer", label: "Thermometer" },
    { value: "droplet", label: "Humidity" },
    { value: "wind", label: "Wind" },
    { value: "activity", label: "Activity" },
    { value: "sun", label: "Sun" },
  ],
  Signal: [
    { value: "exclamation", label: "Exclamation" },
    { value: "antenna", label: "Antenna" },
    { value: "signal-bars", label: "Signal Bars" },
    { value: "satellite", label: "Satellite" },
  ],
};

/**
 * The in-memory representation of a single item on the canvas.
 * Layout fields (id/x/y/width/height) go into facility.data.
 * - Zone items are persisted as rows in facility_zones.
 * - Non-zone items are persisted as rows in facility_devices (with optional zoneId).
 */
export interface PlacedItem {
  id: string;
  type: PlacedItemType;
  /** Canvas / layout metadata */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Links a device to a zone (set on non-zone items only). */
  zoneId: string | null;
  /** facility_devices / facility_zones columns */
  name: string;
  status: string;
  notes: string;
  /** Type-specific non-layout properties (stored in the relevant table's data column). */
  props: Record<string, string | number>;
}

// ─── Persistence shapes ──────────────────────────────────────────────────

/**
 * What goes into facilities.data: only canvas-level metadata.
 * Dimensions for each item are stored here (not in facility_devices).
 */
export interface CanvasLayoutData {
  version: 1;
  items: CanvasItemLayout[];
}

export interface CanvasItemLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Type-specific properties by device kind. */
export const DEFAULT_PROPS: Record<PlacedItemType, Record<string, string | number>> = {
  Zone: { iconColor: "#3b82f6" },
  Marker: { label: "", iconColor: "#f59e0b", markerType: "info", iconShape: "diamond" },
  CCTV: {
    videoSource: "simulation",
    simulationType: "ai-motion",
    simulationStream: "",
    streamUrl: "",
    streamPath: "",
    deviceId: "",
    status: "online",
    iconColor: "#10b981",
    iconShape: "camera",
  },
  Sensor: {
    sensorDataSource: "simulation",
    simulationDeviceId: "sensor-temp-001",
    connectionMethod: "http-pull",
    payloadFormat: "facilix",
    pullUrl: "",
    deviceId: "",
    unit: "°C",
    threshold: 50,
    iconColor: "#8b5cf6",
    sensorType: "temperature",
    pollInterval: 30,
    iconShape: "wifi",
  },
  Signal: { strength: 80, frequency: 2400, iconColor: "#06b6d4", protocol: "wifi", iconShape: "exclamation" },
};

/** Default width/height for each item type (canvas layout defaults). */
export const DEFAULT_SIZES: Record<PlacedItemType, { width: number; height: number }> = {
  Zone: { width: 140, height: 90 },
  Marker: { width: 36, height: 36 },
  CCTV: { width: 36, height: 36 },
  Sensor: { width: 36, height: 36 },
  Signal: { width: 36, height: 36 },
};

// ─── Mappers ──────────────────────────────────────────────────────────────

/** Extract the layout portion that gets stored in facilities.data. */
export function toCanvasData(items: PlacedItem[]): CanvasLayoutData {
  return {
    version: 1,
    items: items.map((i) => ({
      id: i.id,
      x: i.x,
      y: i.y,
      width: i.width,
      height: i.height,
    })),
  };
}

/** Build facility_zone payloads from zone items. */
export function toZonePayloads(
  facilityId: string,
  items: PlacedItem[],
): {
  id: string;
  facilityId: string;
  name: string;
  data: Record<string, string | number>;
  notes: string;
}[] {
  return items
    .filter((i) => i.type === "Zone")
    .map((i) => ({
      id: i.id,
      facilityId,
      name: i.name,
      data: i.props,
      notes: i.notes,
    }));
}

/** Build facility_device payloads from non-zone items. */
export function toDevicePayloads(
  facilityId: string,
  items: PlacedItem[],
): {
  id: string;
  facilityId: string;
  zoneId: string | null;
  name: string;
  type: PlacedItemType;
  status: string;
  data: Record<string, string | number>;
  notes: string;
}[] {
  return items
    .filter((i) => i.type !== "Zone")
    .map((i) => ({
      id: i.id,
      facilityId,
      zoneId: i.zoneId,
      name: i.name,
      type: i.type,
      status: i.status,
      data: i.props,
      notes: i.notes,
    }));
}

/** Reconstruct PlacedItem[] from canvas layout + zone rows + device rows. */
export function fromSnapshot(
  layout: CanvasLayoutData,
  zones: {
    id: string;
    name: string;
    data: Record<string, string | number>;
    notes: string;
  }[],
  devices: {
    id: string;
    name: string;
    type: PlacedItemType;
    status: string;
    data: Record<string, string | number>;
    notes: string;
    zoneId: string | null;
  }[],
): PlacedItem[] {
  const layoutById = new Map(layout.items.map((l) => [l.id, l]));

  const zoneItems: PlacedItem[] = zones.map((z) => {
    const lay = layoutById.get(z.id);
    return {
      id: z.id,
      type: "Zone" as PlacedItemType,
      x: lay?.x ?? 0,
      y: lay?.y ?? 0,
      width: lay?.width ?? DEFAULT_SIZES.Zone.width,
      height: lay?.height ?? DEFAULT_SIZES.Zone.height,
      zoneId: null,
      name: z.name,
      status: "online",
      notes: z.notes,
      props: z.data,
    };
  });

  const deviceItems: PlacedItem[] = devices.map((d) => {
    const lay = layoutById.get(d.id);
    return {
      id: d.id,
      type: d.type,
      x: lay?.x ?? 0,
      y: lay?.y ?? 0,
      width: lay?.width ?? DEFAULT_SIZES[d.type].width,
      height: lay?.height ?? DEFAULT_SIZES[d.type].height,
      zoneId: d.zoneId,
      name: d.name,
      status: d.status,
      notes: d.notes,
      props: d.data,
    };
  });

  return [...zoneItems, ...deviceItems];
}

// ─── UI helper types (local to the facility route) ────────────────────────

export type EditMode = "monitor" | "edit";

export interface LogEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: PlacedItemType;
  timestamp: Date;
  level: "info" | "warn" | "error";
  message: string;
}

export interface CanvasEditorProps {
  readOnly?: boolean;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onAddItem: (type: PlacedItemType, x: number, y: number) => void;
  onUpdateItem: (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => void;
  onSelectItem: (id: string | null) => void;
}

export interface PropertiesPanelProps {
  editMode: EditMode;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onUpdateItem: (
    id: string,
    data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: Record<string, string | number> }>,
  ) => void;
  onUpdateLayout: (id: string, patch: Partial<Pick<PlacedItem, "width" | "height">>) => void;
  onDeleteItem: (id: string) => void;
}
