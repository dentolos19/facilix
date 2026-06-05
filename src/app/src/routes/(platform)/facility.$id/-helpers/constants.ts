import { BoxIcon, Grid3x3Icon, MapPinIcon, RadioIcon, WifiIcon } from "lucide-react";
import type { PlacedItemType } from "./types";

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
