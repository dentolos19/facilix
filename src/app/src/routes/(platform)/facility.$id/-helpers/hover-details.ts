import type { PlacedItem } from "../-helpers/types";
import { getZoneTypeConfig } from "../-helpers/zone-types";

export interface HoverDetails {
  name: string;
  type: string;
  status: string;
  subtitle: string;
  rows: { label: string; value: string }[];
}

export function getFacilityHoverDetails(item: PlacedItem): HoverDetails {
  const zoneTypeCfg = getZoneTypeConfig(item.props.zoneType);

  if (item.type === "Zone") {
    return {
      name: item.name || "Zone",
      type: zoneTypeCfg.label,
      status: "",
      subtitle: `${Math.round(item.width)} × ${Math.round(item.height)}px`,
      rows: [
        { label: "Type", value: zoneTypeCfg.label },
        { label: "Position", value: `${Math.round(item.x)}, ${Math.round(item.y)}` },
        { label: "Size", value: `${Math.round(item.width)} × ${Math.round(item.height)}` },
      ],
    };
  }

  const typeLabel = item.type;
  const name = item.name || item.type;
  const status = item.status || "unknown";

  const rows: { label: string; value: string }[] = [
    { label: "Type", value: typeLabel },
    { label: "Status", value: status },
    { label: "Position", value: `${Math.round(item.x)}, ${Math.round(item.y)}` },
  ];

  if (item.type === "CCTV") {
    const source = String(item.props.videoSource ?? "simulation");
    const stream = String(item.props.simulationStream ?? "");
    if (source === "simulation" && stream) {
      rows.push({ label: "Stream", value: stream });
    } else if (source !== "simulation") {
      rows.push({ label: "Video Source", value: source });
    }
  }

  if (item.type === "Sensor") {
    const type = String(item.props.sensorType ?? "");
    const unit = String(item.props.unit ?? "");
    const threshold = String(item.props.threshold ?? "");
    if (type) rows.push({ label: "Sensor", value: type });
    if (threshold && unit) rows.push({ label: "Threshold", value: `${threshold}${unit}` });
  }

  if (item.type === "Signal") {
    const protocol = String(item.props.protocol ?? "");
    const strength = String(item.props.strength ?? "");
    if (protocol) rows.push({ label: "Protocol", value: protocol });
    if (strength) rows.push({ label: "Strength", value: strength });
  }

  return {
    name,
    type: typeLabel,
    status,
    subtitle: status,
    rows,
  };
}
