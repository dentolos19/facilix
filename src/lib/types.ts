// ─── Domain types for the facility editor ─────────────────────────────────

export type PlacedItemType = "Zone" | "Marker" | "CCTV" | "Sensor" | "Signal";

/**
 * The in-memory representation of a single item on the canvas.
 * Layout fields (id/x/y/width/height) go into facility.data.
 * Everything else goes into facility_devices.
 */
export interface PlacedItem {
  id: string;
  type: PlacedItemType;
  /** Canvas / layout metadata */
  x: number;
  y: number;
  width: number;
  height: number;
  /** facility_devices columns */
  name: string;
  status: string;
  notes: string;
  /** Type-specific non-layout properties (stored in facility_device.data). */
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
  Marker: { label: "", color: "#f59e0b" },
  CCTV: { label: "", streamUrl: "", status: "online" },
  Sensor: { label: "", unit: "°C", threshold: 50 },
  Signal: { label: "", strength: 80, frequency: 2400 },
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

/** Build facility_device payloads from placed items. */
export function toDevicePayloads(
  facilityId: string,
  items: PlacedItem[],
): {
  id: string;
  facilityId: string;
  name: string;
  type: PlacedItemType;
  status: string;
  data: Record<string, string | number>;
  notes: string;
}[] {
  return items.map((i) => ({
    id: i.id,
    facilityId,
    name: i.name,
    type: i.type,
    status: i.status,
    data: i.props,
    notes: i.notes,
  }));
}

/** Reconstruct PlacedItem[] from a canvas layout + device rows. */
export function fromSnapshot(
  layout: CanvasLayoutData,
  devices: {
    id: string;
    name: string;
    type: PlacedItemType;
    status: string;
    data: Record<string, string | number>;
    notes: string;
  }[],
): PlacedItem[] {
  const layoutById = new Map(layout.items.map((l) => [l.id, l]));

  return devices.map((d) => {
    const lay = layoutById.get(d.id);
    return {
      id: d.id,
      type: d.type,
      x: lay?.x ?? 0,
      y: lay?.y ?? 0,
      width: lay?.width ?? DEFAULT_SIZES[d.type].width,
      height: lay?.height ?? DEFAULT_SIZES[d.type].height,
      name: d.name,
      status: d.status,
      notes: d.notes,
      props: d.data,
    };
  });
}
