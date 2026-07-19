"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getFacilityHoverDetails } from "../-helpers/hover-details";
import type { PlacedItem } from "../-helpers/types";

interface FacilityHoverCardProps {
  item: PlacedItem | null;
  x: number;
  y: number;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function FacilityHoverCard({ item, x, y, containerRef }: FacilityHoverCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  const clampPosition = useCallback(
    (cx: number, cy: number) => {
      const card = cardRef.current;
      const container = containerRef.current;
      if (!card || !container) return { x: cx, y: cy };

      const containerRect = container.getBoundingClientRect();
      const cardW = card.offsetWidth;
      const cardH = card.offsetHeight;
      const margin = 8;

      let px = cx + 12;
      let py = cy + 12;

      if (px + cardW > containerRect.right - margin) {
        px = cx - cardW - 12;
      }
      if (py + cardH > containerRect.bottom - margin) {
        py = cy - cardH - 12;
      }
      if (px < containerRect.left + margin) {
        px = containerRect.left + margin;
      }
      if (py < containerRect.top + margin) {
        py = containerRect.top + margin;
      }

      return { x: px - containerRect.left, y: py - containerRect.top };
    },
    [containerRef],
  );

  useEffect(() => {
    const clamped = clampPosition(x, y);
    setPos(clamped);
  }, [x, y, clampPosition]);

  if (!item) return null;

  const details = getFacilityHoverDetails(item);

  return (
    <div
      className="bg-background border-border pointer-events-none absolute z-40 max-w-[260px] min-w-[180px] rounded-none border p-2.5 shadow-md"
      ref={cardRef}
      style={{
        left: pos.x,
        top: pos.y,
        opacity: item ? 1 : 0,
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground truncate text-xs font-medium">{details.name}</span>
          <span className="text-muted-foreground/70 shrink-0 text-[10px]">{details.subtitle}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {details.rows.map((row) => (
            <div className="flex items-center justify-between gap-2" key={row.label}>
              <span className="text-muted-foreground/60 shrink-0 text-[10px]">{row.label}</span>
              <span className="text-foreground/70 truncate text-right text-[10px]">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
