// ─── Domain types for the facility editor ─────────────────────────────────
// (merged from src/lib/types.ts)

/** Recursive JSON value type used by device/zone JSON `data` columns. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A plain JSON object — the typical shape of `data` columns. */
export type JsonObject = { [key: string]: JsonValue };

export type PlacedItemType = "Zone" | "CCTV" | "Sensor" | "Signal";

/** Available icon shapes per component type. */
export type CctvShape = "camera" | "eye" | "video" | "monitoring";
export type SensorShape = "wifi" | "thermometer" | "droplet" | "wind" | "activity" | "sun";
export type SignalShape = "exclamation" | "antenna" | "signal-bars" | "satellite";

export type IconShape = CctvShape | SensorShape | SignalShape;

/** Default icon shape for each component type. */
export const DEFAULT_ICON_SHAPES: Record<PlacedItemType, IconShape> = {
  Zone: "camera", // unused for zones but needed for type completeness
  CCTV: "camera",
  Sensor: "wifi",
  Signal: "exclamation",
};

/** Available icon shapes for each non-zone component type. */
export const ICON_SHAPE_OPTIONS: Record<string, { value: IconShape; label: string }[]> = {
  CCTV: [
    { value: "camera", label: "Camera" },
    { value: "eye", label: "Eye" },
    { value: "video", label: "Video" },
    { value: "monitoring", label: "Monitoring" },
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
  props: JsonObject;
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
export const DEFAULT_PROPS: Record<PlacedItemType, JsonObject> = {
  Zone: { iconColor: "#3b82f6", zoneType: "generic" },
  CCTV: {
    videoSource: "simulation",
    simulationStream: "b0",
    streamUrl: "",
    streamPath: "",
    deviceId: "",
    status: "online",
    iconColor: "#10b981",
    iconShape: "camera",
    plugins: [],
    capture: {
      segments: { durationSec: 30 },
    },
  },
  Sensor: {
    sensorDataSource: "simulation",
    simulationDeviceId: "sensor-temp-001",
    payloadFormat: "facilix",
    pullUrl: "",
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
  data: JsonObject;
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
  data: JsonObject;
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

/** Geometry helper: detect whether a non-zone device intersects or touches a zone rectangle. */
export function findZoneForDevice(device: PlacedItem, zones: PlacedItem[]): string | null {
  if (device.type === "Zone") return null;
  const r = device.width / 2;
  for (const zone of zones) {
    if (zone.type !== "Zone") continue;
    const closestX = Math.max(zone.x, Math.min(device.x, zone.x + zone.width));
    const closestY = Math.max(zone.y, Math.min(device.y, zone.y + zone.height));
    const dx = device.x - closestX;
    const dy = device.y - closestY;
    if (dx * dx + dy * dy <= r * r) return zone.id;
  }
  return null;
}

/** Recompute zoneId for every non-zone item based on current geometry. */
export function recomputeZoneLinks(items: PlacedItem[]): PlacedItem[] {
  const zones = items.filter((i) => i.type === "Zone");
  if (zones.length === 0) return items;
  return items.map((item) => {
    if (item.type === "Zone") return item;
    const zoneId = findZoneForDevice(item, zones);
    return zoneId === item.zoneId ? item : { ...item, zoneId };
  });
}

/** Reconstruct PlacedItem[] from canvas layout + zone rows + device rows. */
export function fromSnapshot(
  layout: CanvasLayoutData,
  zones: {
    id: string;
    name: string;
    data: JsonObject;
    notes: string;
  }[],
  devices: {
    id: string;
    name: string;
    type: PlacedItemType;
    status: string;
    data: JsonObject;
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
      status: "—",
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

export type EditMode = "monitoring" | "edit";

export interface CanvasEditorProps {
  readOnly?: boolean;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onAddItem: (type: PlacedItemType, x: number, y: number) => void;
  onUpdateItem: (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => void;
  onSelectItem: (id: string | null) => void;
  onHoverItem?: (id: string | null) => void;
  onHoverMove?: (x: number, y: number) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onMoveToFront?: (id: string) => void;
  onMoveToBack?: (id: string) => void;
  onDeleteItems?: (ids: string[]) => void;
}

export interface PropertiesPanelProps {
  editMode: EditMode;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onUpdateItem: (id: string, data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: JsonObject }>) => void;
  onUpdateLayout: (id: string, patch: Partial<Pick<PlacedItem, "width" | "height">>) => void;
  onDeleteItem: (id: string) => void;
}
