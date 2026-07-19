import type { JsonValue } from "./types";

export const ZONE_TYPES = [
  "generic",
  "office",
  "car-park",
  "factory-floor",
  "warehouse",
  "loading-bay",
  "storage",
  "lobby",
  "meeting-room",
  "break-room",
  "server-room",
  "laboratory",
] as const;

export type ZoneType = (typeof ZONE_TYPES)[number];

export interface ZoneTypeDefinition {
  value: ZoneType;
  label: string;
  description: string;
  iconColor: string;
  defaultSize: { width: number; height: number };
  furniturePool: readonly string[];
}

export const ZONE_TYPE_CONFIGS: Record<ZoneType, ZoneTypeDefinition> = {
  generic: {
    value: "generic",
    label: "Generic",
    description: "A general-purpose area with neutral furnishing.",
    iconColor: "#3b82f6",
    defaultSize: { width: 140, height: 90 },
    furniturePool: ["desk", "chair", "plant", "crate", "cabinet"],
  },
  office: {
    value: "office",
    label: "Office",
    description: "Individual or shared workspace with desks and chairs.",
    iconColor: "#8b5cf6",
    defaultSize: { width: 160, height: 120 },
    furniturePool: ["desk", "chair", "cabinet", "desk", "chair", "plant"],
  },
  "car-park": {
    value: "car-park",
    label: "Car Park",
    description: "Vehicle parking area with marked bays.",
    iconColor: "#f59e0b",
    defaultSize: { width: 300, height: 200 },
    furniturePool: ["vehicle", "vehicle", "vehicle", "vehicle"],
  },
  "factory-floor": {
    value: "factory-floor",
    label: "Factory Floor",
    description: "Production area with work cells and equipment.",
    iconColor: "#ef4444",
    defaultSize: { width: 300, height: 200 },
    furniturePool: ["pallet", "crate", "crate", "rack", "pallet", "rack"],
  },
  warehouse: {
    value: "warehouse",
    label: "Warehouse",
    description: "Storage area with shelving, pallets, and crates.",
    iconColor: "#d97706",
    defaultSize: { width: 250, height: 180 },
    furniturePool: ["crate", "pallet", "crate", "pallet", "crate", "pallet", "rack"],
  },
  "loading-bay": {
    value: "loading-bay",
    label: "Loading Bay",
    description: "Loading and unloading area with staging pallets.",
    iconColor: "#a16207",
    defaultSize: { width: 200, height: 150 },
    furniturePool: ["pallet", "crate", "crate", "pallet", "pallet"],
  },
  storage: {
    value: "storage",
    label: "Storage",
    description: "Storage room with racks, crates, and cabinets.",
    iconColor: "#78716c",
    defaultSize: { width: 140, height: 100 },
    furniturePool: ["rack", "crate", "crate", "rack"],
  },
  lobby: {
    value: "lobby",
    label: "Lobby",
    description: "Reception area with seating and plants.",
    iconColor: "#22c55e",
    defaultSize: { width: 180, height: 120 },
    furniturePool: ["desk", "plant", "chair", "plant"],
  },
  "meeting-room": {
    value: "meeting-room",
    label: "Meeting Room",
    description: "Conference room with a central table and chairs.",
    iconColor: "#06b6d4",
    defaultSize: { width: 180, height: 140 },
    furniturePool: ["desk", "chair", "chair", "chair", "chair", "plant"],
  },
  "break-room": {
    value: "break-room",
    label: "Break Room",
    description: "Staff break room with tables, chairs, and plants.",
    iconColor: "#84cc16",
    defaultSize: { width: 160, height: 120 },
    furniturePool: ["table", "chair", "chair", "chair", "chair", "plant"],
  },
  "server-room": {
    value: "server-room",
    label: "Server Room",
    description: "Equipment room with rack rows and cabinets.",
    iconColor: "#71717a",
    defaultSize: { width: 140, height: 100 },
    furniturePool: ["rack", "rack", "rack", "cabinet", "cabinet"],
  },
  laboratory: {
    value: "laboratory",
    label: "Laboratory",
    description: "Lab space with benches, stools, and equipment.",
    iconColor: "#f97316",
    defaultSize: { width: 180, height: 140 },
    furniturePool: ["desk", "cabinet", "cabinet", "desk", "chair"],
  },
};

export function getZoneTypeConfig(value: string | JsonValue | undefined): ZoneTypeDefinition {
  if (typeof value === "string" && value in ZONE_TYPE_CONFIGS) {
    return ZONE_TYPE_CONFIGS[value as ZoneType];
  }
  return ZONE_TYPE_CONFIGS.generic;
}

export function isZoneType(value: unknown): value is ZoneType {
  return typeof value === "string" && (ZONE_TYPES as readonly string[]).includes(value);
}
