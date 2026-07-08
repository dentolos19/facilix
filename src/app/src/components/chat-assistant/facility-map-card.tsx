import { ExpandIcon } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import type { UiFacilityMap, UiFacilityMapItem } from "#/lib/chat/ui";

const TYPE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  Zone: { fill: "rgba(59,130,246,0.08)", stroke: "#3b82f6", label: "Zone" },
  CCTV: { fill: "rgba(16,185,129,0.15)", stroke: "#10b981", label: "CCTV" },
  Sensor: { fill: "rgba(139,92,246,0.15)", stroke: "#8b5cf6", label: "Sensor" },
  Signal: { fill: "rgba(6,182,212,0.15)", stroke: "#06b6d4", label: "Signal" },
};

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  degraded: "#f59e0b",
  error: "#ef4444",
  offline: "#ef4444",
};

const DEVICE_ICON_PATHS: Record<string, string> = {
  CCTV: "M7.5 3.5h9l2.5 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3l2.5-3zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  Sensor: "M12 2.7l5.66 5.66a8 8 0 1 1-11.31 0L12 2.7z",
  Signal: "M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01",
};

export function FacilityMapCard({ data }: { data: UiFacilityMap }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ width: 400, height: 250 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setCardSize({ width: w, height: Math.round(w * 0.55) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => {
    if (data.items.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 250 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const item of data.items) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    }
    const pad = 40;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, [data.items]);

  const highlighted = useMemo(
    () => new Set(data.highlightedDeviceIds),
    [data.highlightedDeviceIds],
  );
  const hasHighlightedItems = highlighted.size > 0;

  const [selectedDeviceName, setSelectedDeviceName] = useState<string | null>(null);

  return (
    <>
      <div
        ref={containerRef}
        className="border-border bg-muted/10 relative my-2 overflow-hidden rounded-lg border"
      >
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-muted-foreground text-[11px] font-medium">Facility Layout</span>
          <Button
            aria-label="Expand map"
            onClick={() => setExpanded(true)}
            size="icon-xs"
            variant="ghost"
          >
            <ExpandIcon className="size-3.5" />
          </Button>
        </div>
        <svg
          className="size-full"
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}
          style={{ maxHeight: cardSize.height }}
        >
          {data.items.map((item) => (
            <MapItem
              dimmed={hasHighlightedItems && !highlighted.has(item.id)}
              highlighted={highlighted.has(item.id)}
              item={item}
              key={item.id}
              onHover={setSelectedDeviceName}
            />
          ))}
        </svg>
        {selectedDeviceName && (
          <div className="bg-background/90 absolute right-2 bottom-2 rounded px-2 py-1 text-[10px] font-medium backdrop-blur-sm">
            {selectedDeviceName}
          </div>
        )}
      </div>

      <Dialog onOpenChange={setExpanded} open={expanded}>
        <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
            <DialogTitle className="text-sm">Facility Layout</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-4 pt-0">
            <svg
              className="size-full"
              viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {data.items.map((item) => (
                <MapItem
                  dimmed={hasHighlightedItems && !highlighted.has(item.id)}
                  highlighted={highlighted.has(item.id)}
                  item={item}
                  key={item.id}
                  onHover={setSelectedDeviceName}
                />
              ))}
            </svg>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MapItem({
  item,
  highlighted,
  dimmed,
  onHover,
}: {
  item: UiFacilityMapItem;
  highlighted: boolean;
  dimmed: boolean;
  onHover: (name: string | null) => void;
}) {
  const colors = TYPE_COLORS[item.type] ?? TYPE_COLORS.Sensor;
  const statusDot = STATUS_COLORS[item.status] ?? STATUS_COLORS.online;
  const isZone = item.type === "Zone";
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;

  return (
    <g
      className="transition-opacity duration-150"
      onMouseEnter={() => onHover(item.name)}
      onMouseLeave={() => onHover(null)}
      opacity={dimmed ? 0.45 : 1}
      style={{ cursor: "default" }}
    >
      {isZone ? (
        <>
          <rect
            fill={colors.fill}
            rx={4}
            ry={4}
            stroke={highlighted ? "#3b82f6" : colors.stroke}
            strokeWidth={highlighted ? 2 : 1}
            strokeDasharray="4 2"
            x={item.x}
            y={item.y}
            width={item.width}
            height={item.height}
          />
          <text
            className="pointer-events-none select-none"
            dominantBaseline="middle"
            fill={colors.stroke}
            fontSize={10}
            textAnchor="middle"
            x={cx}
            y={cy}
          >
            {item.name}
          </text>
        </>
      ) : (
        <>
          <circle
            cx={cx}
            cy={cy}
            fill={highlighted ? "#3b82f6" : colors.fill}
            r={item.width > 40 ? 18 : 14}
            stroke={highlighted ? "#3b82f6" : colors.stroke}
            strokeWidth={highlighted ? 2.5 : 1.5}
          />
          <path
            d={DEVICE_ICON_PATHS[item.type] ?? DEVICE_ICON_PATHS.Sensor}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            transform={`translate(${cx - 14}, ${cy - 14}) scale(1.17)`}
            className={
              highlighted ? "text-white" : isZone ? "text-foreground/70" : "text-white"
            }
          />
          <circle cx={cx + 10} cy={cy - 10} fill={statusDot} r={4} stroke="white" strokeWidth={1.5} />
        </>
      )}
    </g>
  );
}
