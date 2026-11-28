import { useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, CpuIcon, ExternalLinkIcon } from "lucide-react";

import { ScrollArea } from "#/components/ui/scroll-area";

import type { PlacedItem } from "../-helpers/types";
import { getZoneTypeConfig } from "../-helpers/zone-types";

function PropRow({ label, value, monospace }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <dt className="shrink-0 text-[10px] text-muted-foreground/60">{label}</dt>
      <dd
        className={
          monospace
            ? "text-right font-mono text-[10px] break-all text-foreground/70"
            : "text-right text-[10px] break-words text-foreground/70"
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
      className="flex w-full items-center gap-2 border border-border bg-muted/20 p-2 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
      onClick={onSelect}
      type="button"
    >
      <div className="flex size-7 shrink-0 items-center justify-center bg-muted/50 text-muted-foreground">
        <CpuIcon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-foreground">{device.name || device.type}</p>
        <p className="text-[10px] text-muted-foreground/60">{device.type}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${statusStyle.badge}`}
      >
        <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
        {device.status}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
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
      <div className="flex h-full items-center justify-center px-6 text-center text-[11px] text-muted-foreground/50">
        Select a zone on the map to view its details.
      </div>
    );
  }

  const zoneTypeCfg = getZoneTypeConfig(selectedZone.props.zoneType);
  const assignedDevices = devices.filter((device) => device.type !== "Zone" && device.zoneId === selectedZone.id);

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-3 p-4">
        <h3 className="shrink-0 font-heading text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Zone Details
        </h3>

        <div className="rounded-none border border-border bg-muted/20 p-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">{selectedZone.name}</p>
              <p className="text-[11px] text-muted-foreground/70">{zoneTypeCfg.label}</p>
            </div>
            <button
              aria-label="View zone details"
              className="flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-foreground"
              onClick={() => navigate({ to: "/device/$id", params: { id: selectedZone.id } })}
            >
              <ExternalLinkIcon className="size-3.5" />
            </button>
          </div>

          <dl className="mt-2 flex flex-col gap-1.5 border-t border-border/50 pt-2">
            <PropRow label="Zone Type" value={zoneTypeCfg.label} />
            <PropRow label="Width" value={`${selectedZone.width}px`} />
            <PropRow label="Height" value={`${selectedZone.height}px`} />
            <PropRow label="Position" value={`${Math.round(selectedZone.x)}, ${Math.round(selectedZone.y)}`} />
            <PropRow label="Assigned Devices" value={String(assignedDevices.length)} />
            {selectedZone.notes && <PropRow label="Notes" value={selectedZone.notes} />}
          </dl>
        </div>

        <div className="flex flex-col gap-1">
          <h4 className="font-heading text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Devices ({assignedDevices.length})
          </h4>
          {assignedDevices.length > 0 ? (
            assignedDevices.map((device) => (
              <DeviceRow device={device} key={device.id} onSelect={() => onSelectDevice(device.id)} />
            ))
          ) : (
            <div className="flex flex-col items-center gap-1.5 border border-dashed border-border bg-muted/10 px-3 py-5 text-center">
              <CpuIcon className="size-5 text-muted-foreground/30" />
              <p className="text-[10px] text-muted-foreground/60">No devices assigned to this zone.</p>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
