import { BoxIcon, Grid3x3Icon, MapPinIcon, RadioIcon, WifiIcon } from "lucide-react";
import type { PlacedItemType } from "#/lib/types";

export const CCTV_MESSAGES: [string, "info" | "warn" | "error"][] = [
  ["Motion detected — sector A4", "info"],
  ["Person identified at loading bay 2", "info"],
  ["Object left unattended near conveyor B", "warn"],
  ["Camera feed signal restored", "info"],
  ["Motion detected — north entrance", "info"],
  ["Unauthorised access attempt — door 7", "error"],
  ["Motion detected — warehouse aisle 3", "info"],
  ["Camera feed lost — sector C1", "error"],
  ["Vehicle detected at gate 1", "info"],
  ["PPE violation — missing hard hat", "warn"],
];

export const SENSOR_MESSAGES: [string, "info" | "warn" | "error"][] = [
  ["Temperature: 24.5 °C — normal", "info"],
  ["Temperature: 31.2 °C — exceeds threshold", "warn"],
  ["Humidity: 62 % — normal", "info"],
  ["Air quality: PM2.5 = 45 µg/m³ — moderate", "info"],
  ["Vibration detected — machine #3", "warn"],
  ["Temperature: 22.1 °C — normal", "info"],
  ["Air quality: PM2.5 = 82 µg/m³ — unhealthy", "warn"],
  ["Temperature: 19.8 °C — normal", "info"],
  ["CO₂: 1200 ppm — elevated", "warn"],
  ["Gas leak detected — sensor unit alpha", "error"],
];

export const SIGNAL_MESSAGES: [string, "info" | "warn" | "error"][] = [
  ["Signal strength: 92 % — excellent", "info"],
  ["Signal strength: 67 % — good", "info"],
  ["Signal strength: 34 % — weak", "warn"],
  ["Connection established — gateway delta", "info"],
  ["Packet loss: 12 % — checking link", "warn"],
  ["Signal strength: 45 % — moderate", "info"],
  ["Connection dropped — reconnecting", "error"],
  ["Frequency: 2.4 GHz — channel 6", "info"],
  ["Interference detected — switching channel", "warn"],
  ["Signal restored — all clear", "info"],
];

/** Visual dimensions and colours for each component type (fallback defaults). */
export const ITEM_DEFS: Record<
  PlacedItemType,
  { width: number; height: number; fill: string; stroke: string; label: string }
> = {
  Zone: { width: 140, height: 90, fill: "rgba(59,130,246,0.08)", stroke: "#3b82f6", label: "Zone" },
  Marker: { width: 36, height: 36, fill: "#f59e0b", stroke: "#d97706", label: "Marker" },
  CCTV: { width: 36, height: 36, fill: "#10b981", stroke: "#059669", label: "CCTV" },
  Sensor: { width: 36, height: 36, fill: "#8b5cf6", stroke: "#7c3aed", label: "Sensor" },
  Signal: { width: 36, height: 36, fill: "#06b6d4", stroke: "#0891b2", label: "Signal" },
};

/** Component palette shown in edit mode. */
export const PLACEABLE_ITEMS: {
  label: PlacedItemType;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: string;
  bgColor: string;
}[] = [
  {
    label: "Zone",
    icon: Grid3x3Icon,
    description: "Rooms, areas & locations",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    label: "Marker",
    icon: MapPinIcon,
    description: "Labels, notes & alerts",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    label: "CCTV",
    icon: BoxIcon,
    description: "AI cameras & live feeds",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    label: "Sensor",
    icon: WifiIcon,
    description: "IoT environmental sensors",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    label: "Signal",
    icon: RadioIcon,
    description: "Connectivity & gateways",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
];
