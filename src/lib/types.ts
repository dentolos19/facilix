// ─── Domain types for the facility editor ─────────────────────────────────

export type PlacedItemType = "Zone" | "Marker" | "CCTV" | "Sensor" | "Signal";

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
  Zone: { color: "#3b82f6" },
  Marker: { label: "", color: "#f59e0b", markerType: "info" },
  CCTV: { streamUrl: "", status: "online", color: "#10b981", protocol: "rtsp", auth: "none" },
  Sensor: { unit: "°C", threshold: 50, color: "#8b5cf6", sensorType: "temperature", pollInterval: 30 },
  Signal: { strength: 80, frequency: 2400, color: "#06b6d4", protocol: "wifi" },
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
