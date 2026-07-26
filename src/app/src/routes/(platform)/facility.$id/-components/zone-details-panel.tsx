import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, CpuIcon, ExternalLinkIcon } from "lucide-react";

import { ScrollArea } from "#/components/ui/scroll-area";

import type { PlacedItem } from "../-helpers/types";
import { getZoneTypeConfig } from "../-helpers/zone-types";

function PropRow({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="text-muted-foreground/60 shrink-0 text-[10px]">{label}</dt>
      <dd
        className={
          monospace
            ? "text-foreground/70 text-right font-mono text-[10px] break-all"
            : "text-foreground/70 text-right text-[10px] break-words"
        }
      >
        {value}
      </dd>
    </div>
  );
}

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  online: { badge: "bg-green-500/10 text-green-600", dot: "bg-green-500" },
  degraded: { badge: "bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  error: { badge: "bg-red-500/10 text-red-600", dot: "bg-red-500" },
  offline: { badge: "bg-red-500/10 text-red-600", dot: "bg-red-500" },
};

function DeviceRow({ device, onSelect }: { device: PlacedItem; onSelect: () => void }) {
  const statusStyle = STATUS_STYLES[device.status] ?? {
    badge: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  };

  return (
    <button
      aria-label={`View properties for ${device.name || device.type}`}
      className="border-border bg-muted/20 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center gap-2 border p-2 text-left transition-colors outline-none focus-visible:ring-1"
      onClick={onSelect}
      type="button"
    >
      <div className="bg-muted/50 text-muted-foreground flex size-7 shrink-0 items-center justify-center">
        <CpuIcon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-[11px] font-medium">{device.name || device.type}</p>
        <p className="text-muted-foreground/60 text-[10px]">{device.type}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${statusStyle.badge}`}
      >
        <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
        {device.status}
      </span>
      <ChevronRightIcon className="text-muted-foreground/50 size-3.5 shrink-0" />
    </button>
  );
}

export function ZoneDetailsPanel({
  selectedZone,
  devices,
  onSelectDevice,
}: {
  selectedZone: PlacedItem | null;
  devices: PlacedItem[];
  onSelectDevice: (deviceId: string) => void;
}) {
  const navigate = useNavigate();

  if (!selectedZone) {
    return (
      <div className="text-muted-foreground/50 flex h-full items-center justify-center px-6 text-center text-[11px]">
        Select a zone on the map to view its details.
      </div>
    );
  }

  const zoneTypeCfg = getZoneTypeConfig(selectedZone.props.zoneType);
  const assignedDevices = devices.filter((device) => device.type !== "Zone" && device.zoneId === selectedZone.id);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        <h3 className="font-heading text-muted-foreground shrink-0 text-xs font-medium tracking-wider uppercase">
          Zone Details
        </h3>

        <div className="border-border bg-muted/20 rounded-none border p-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-foreground text-xs font-medium">{selectedZone.name}</p>
              <p className="text-muted-foreground/70 text-[11px]">{zoneTypeCfg.label}</p>
            </div>
            <button
              aria-label="View zone details"
              className="text-muted-foreground/50 hover:bg-muted/40 hover:text-foreground flex size-6 items-center justify-center rounded transition-colors"
              onClick={() => navigate({ to: "/device/$id", params: { id: selectedZone.id } })}
            >
              <ExternalLinkIcon className="size-3.5" />
            </button>
          </div>

          <dl className="border-border/50 mt-2 flex flex-col gap-1.5 border-t pt-2">
            <PropRow label="Zone Type" value={zoneTypeCfg.label} />
            <PropRow label="Width" value={`${selectedZone.width}px`} />
            <PropRow label="Height" value={`${selectedZone.height}px`} />
            <PropRow label="Position" value={`${Math.round(selectedZone.x)}, ${Math.round(selectedZone.y)}`} />
            <PropRow label="Assigned Devices" value={String(assignedDevices.length)} />
            {selectedZone.notes && <PropRow label="Notes" value={selectedZone.notes} />}
          </dl>
        </div>

        <div className="flex flex-col gap-1">
          <h4 className="font-heading text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            Devices ({assignedDevices.length})
          </h4>
          {assignedDevices.length > 0 ? (
            assignedDevices.map((device) => (
              <DeviceRow device={device} key={device.id} onSelect={() => onSelectDevice(device.id)} />
            ))
          ) : (
            <div className="border-border bg-muted/10 flex flex-col items-center gap-1.5 border border-dashed px-3 py-5 text-center">
              <CpuIcon className="text-muted-foreground/30 size-5" />
              <p className="text-muted-foreground/60 text-[10px]">No devices assigned to this zone.</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
