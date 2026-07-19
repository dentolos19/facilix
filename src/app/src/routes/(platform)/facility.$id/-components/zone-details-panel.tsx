import { useNavigate } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

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

export function ZoneDetailsPanel({
  selectedZone,
  devices,
}: {
  selectedZone: PlacedItem | null;
  devices: PlacedItem[];
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
  const assignedDevices = devices.filter((d) => d.zoneId === selectedZone.id);

  return (
    <div className="flex flex-col gap-2 p-4">
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

      {assignedDevices.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="font-heading text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            Devices ({assignedDevices.length})
          </h4>
          {assignedDevices.map((d) => (
            <div className="text-foreground/80 text-[11px]" key={d.id}>
              {d.name || d.type} —{" "}
              <span
                className={
                  d.status === "online"
                    ? "text-green-500"
                    : d.status === "error"
                      ? "text-red-500"
                      : "text-muted-foreground"
                }
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
