import {
  DEFAULT_PROPS,
  DEFAULT_SIZES,
  recomputeZoneLinks,
  type JsonObject,
  type JsonValue,
  type PlacedItem,
  type PlacedItemType,
} from "#/routes/(platform)/facility.$id/-helpers/types";

export const FACILITY_LAYOUT_FORMAT = "facilix-facility-layout";
export const FACILITY_LAYOUT_VERSION = 1;

export interface FacilityLayoutDocument {
  format: typeof FACILITY_LAYOUT_FORMAT;
  version: typeof FACILITY_LAYOUT_VERSION;
  facilityName: string;
  canvas: {
    width: number;
    height: number;
  };
  items: PlacedItem[];
}

const ITEM_TYPES = new Set<PlacedItemType>(["Zone", "CCTV", "Sensor", "Signal"]);
const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue).filter((item): item is JsonValue => item !== undefined);
  }
  if (typeof value !== "object") return undefined;

  const result: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_JSON_KEYS.has(key)) continue;
    const sanitized = sanitizeJsonValue(child);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeProps(value: unknown): JsonObject {
  const sanitized = sanitizeJsonValue(value);
  return sanitized && !Array.isArray(sanitized) && typeof sanitized === "object" ? sanitized : {};
}

/**
 * Converts the model's JSON into safe editor state. Model-provided IDs are
 * remapped so duplicate or malformed IDs cannot collide with persisted rows.
 */
export function parseGeneratedFacilityLayout(
  value: unknown,
  target: { width: number; height: number },
): FacilityLayoutDocument {
  if (!value || typeof value !== "object") throw new Error("The model did not return a JSON object.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.items)) throw new Error("The model response is missing an items array.");

  const width = clamp(Math.round(finiteNumber(target.width, 1000)), 320, 4096);
  const height = clamp(Math.round(finiteNumber(target.height, 700)), 240, 4096);
  const modelIdToId = new Map<string, string>();

  const candidates = input.items.slice(0, 100).flatMap((raw, index): PlacedItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.type !== "string" || !ITEM_TYPES.has(item.type as PlacedItemType)) return [];

    const type = item.type as PlacedItemType;
    const modelId = typeof item.id === "string" && item.id.length > 0 ? item.id : `item-${index + 1}`;
    const id = crypto.randomUUID();
    modelIdToId.set(modelId, id);
    const defaultSize = DEFAULT_SIZES[type];
    const itemWidth = clamp(Math.round(finiteNumber(item.width, defaultSize.width)), 20, width);
    const itemHeight = clamp(Math.round(finiteNumber(item.height, defaultSize.height)), 20, height);

    return [
      {
        id,
        type,
        x: clamp(Math.round(finiteNumber(item.x, 0)), 0, Math.max(0, width - itemWidth)),
        y: clamp(Math.round(finiteNumber(item.y, 0)), 0, Math.max(0, height - itemHeight)),
        width: itemWidth,
        height: itemHeight,
        zoneId: typeof item.zoneId === "string" ? item.zoneId : null,
        name:
          typeof item.name === "string" && item.name.trim().length > 0
            ? item.name.trim().slice(0, 120)
            : `${type} ${index + 1}`,
        status: typeof item.status === "string" ? item.status.slice(0, 40) : type === "Zone" ? "—" : "unknown",
        notes: typeof item.notes === "string" ? item.notes.slice(0, 1000) : "",
        props: { ...DEFAULT_PROPS[type], ...sanitizeProps(item.props) },
      },
    ];
  });

  if (candidates.length === 0) throw new Error("The model could not identify any facility elements in the image.");

  const items = candidates.map((item) => ({
    ...item,
    zoneId: item.zoneId ? (modelIdToId.get(item.zoneId) ?? null) : null,
  }));

  return {
    format: FACILITY_LAYOUT_FORMAT,
    version: FACILITY_LAYOUT_VERSION,
    facilityName:
      typeof input.facilityName === "string" && input.facilityName.trim()
        ? input.facilityName.trim().slice(0, 120)
        : "Imported facility",
    canvas: { width, height },
    items: recomputeZoneLinks(items),
  };
}

export function createFacilityLayoutDocument(
  facilityName: string,
  items: PlacedItem[],
  canvas: { width: number; height: number },
): FacilityLayoutDocument {
  return {
    format: FACILITY_LAYOUT_FORMAT,
    version: FACILITY_LAYOUT_VERSION,
    facilityName,
    canvas: {
      width: Math.max(0, Math.round(canvas.width)),
      height: Math.max(0, Math.round(canvas.height)),
    },
    items,
  };
}
