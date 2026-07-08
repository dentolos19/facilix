import type { JsonObject, PlacedItemType } from "#/routes/(platform)/facility.$id/-helpers/types";

export interface UiFacilitySummary {
  facilityName: string;
  zoneCount: number;
  deviceCount: number;
  onlineCount: number;
  errorCount: number;
  offlineCount: number;
  eventCount: number;
  healthScore: number;
}

export interface UiFacilityMapItem {
  id: string;
  type: PlacedItemType;
  name: string;
  status: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zoneId: string | null;
  zoneName: string | null;
  props: JsonObject;
}

export interface UiFacilityMap {
  items: UiFacilityMapItem[];
  highlightedDeviceIds: string[];
}

export interface UiDeviceEntry {
  id: string;
  name: string;
  type: string;
  status: string;
  zoneId: string | null;
  zoneName: string | null;
  notes: string | null;
  latestReading: UiSensorReading | null;
}

export interface UiSensorReading {
  sensorType: string;
  value: number;
  unit: string;
  status: string;
  secondaryValue: number | null;
  secondaryUnit: string | null;
  batteryPct: number | null;
  signalRssiDbm: number | null;
  timestamp: string;
}

export interface UiSensorHistoryEntry {
  deviceId: string;
  deviceName: string;
  sensorType: string;
  value: number;
  unit: string;
  status: string;
  batteryPct: number | null;
  timestamp: string;
}

export interface UiSensorHistory {
  readings: UiSensorHistoryEntry[];
}

export interface UiEventEntry {
  id: string;
  deviceId: string | null;
  deviceName: string | null;
  severity: string;
  type: string;
  message: string;
  createdAt: string;
  zoneName: string | null;
  hasMedia: boolean;
  mediaCount: number;
}

export interface UiEventList {
  count: number;
  events: UiEventEntry[];
  deviceFilter?: string;
}

export interface UiMediaEntry {
  id: string;
  kind: "image" | "video" | "unknown";
  source: "recording" | "prediction" | "event";
  deviceId: string | null;
  name: string;
  url: string;
  thumbnailUrl?: string;
  durationSec?: number | null;
  createdAt: string;
}

export interface UiMediaGallery {
  entries: UiMediaEntry[];
}

export interface UiMediaInspection {
  assetName: string;
  assetType: string;
  assetUrl: string;
  status: string;
  answer: string;
}

export type UiPayload =
  | { kind: "facility-summary"; data: UiFacilitySummary }
  | { kind: "facility-map"; data: UiFacilityMap }
  | { kind: "device-list"; data: UiDeviceEntry[] }
  | { kind: "sensor-history"; data: UiSensorHistory }
  | { kind: "event-list"; data: UiEventList }
  | { kind: "media-gallery"; data: UiMediaGallery }
  | { kind: "media-inspection"; data: UiMediaInspection };
