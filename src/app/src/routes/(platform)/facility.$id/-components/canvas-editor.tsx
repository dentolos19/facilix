import type Konva from "konva";
import { ArrowDownIcon, ArrowUpIcon, ArrowDownToLineIcon, ArrowUpToLineIcon, Trash2Icon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Path, Rect, Stage, Text, Transformer } from "react-konva";

import { ITEM_DEFS, PLACEABLE_ITEMS } from "../-helpers/constants";
import { useIsomorphicLayoutEffect, useResizeObserver } from "../-helpers/hooks";
import type { CanvasEditorProps, PlacedItem, PlacedItemType } from "../-helpers/types";
import { DEFAULT_ICON_SHAPES } from "../-helpers/types";
import { darkenHex, getCanvasColors, hexToRgba, lightenHex } from "../-helpers/utils";

function normRect(r: { x1: number; y1: number; x2: number; y2: number }) {
  return {
    x: Math.min(r.x1, r.x2),
    y: Math.min(r.y1, r.y2),
    width: Math.abs(r.x2 - r.x1),
    height: Math.abs(r.y2 - r.y1),
  };
}

function hitTest(item: PlacedItem, r: { x: number; y: number; width: number; height: number }): boolean {
  if (item.type === "Zone") {
    return !(
      item.x + item.width < r.x ||
      r.x + r.width < item.x ||
      item.y + item.height < r.y ||
      r.y + r.height < item.y
    );
  }
  const cx = item.x;
  const cy = item.y;
  return cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
}

const CANVAS_ICON_PATHS = {
  camera: [
    "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
    "M12 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  ],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z", "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0"],
  video: [
    "M23 7l-7 5 7 5V7z",
    "M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
  ],
  monitoring: ["M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z", "M8 21h8", "M12 17v4"],
  wifi: ["M5 13a10 10 0 0 1 14 0", "M8.5 16.5a5 5 0 0 1 7 0", "M12 20h.01"],
  thermometer: ["M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4 4 0 1 0 5 0z"],
  droplet: ["M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z"],
  wind: ["M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2", "M9.6 4.6A2 2 0 1 1 11 8H2", "M12.6 19.4A2 2 0 1 0 14 16H2"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  sun: [
    "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
    "M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41",
  ],
  exclamation: ["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  antenna: ["M4.9 19.1C1 15.2 1 8.8 4.9 4.9", "M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5", "M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5", "M19.1 4.9c3.9 3.9 3.9 10.3 0 14.2", "M9 18l3-9 3 9", "M10.5 14h3"],
  "signal-bars": ["M2 20h.01", "M7 20v-4", "M12 20v-8", "M17 20V8", "M22 20V4"],
  satellite: ["M13 7 9 3 5 7l4 4", "M17 11l4 4-4 4-4-4", "M8 12l4 4", "M16 8l4 4"],
} as const satisfies Record<string, readonly string[]>;

type CanvasIconName = keyof typeof CANVAS_ICON_PATHS;

function isCanvasIconName(value: string): value is CanvasIconName {
  return value in CANVAS_ICON_PATHS;
}

function CanvasItemIcon({ name }: { name: CanvasIconName }) {
  const scale = 0.72;

  return (
    <Group x={-12 * scale} y={-12 * scale} scaleX={scale} scaleY={scale}>
      {CANVAS_ICON_PATHS[name].map((data, index) => (
        <Path
          data={data}
          fill="transparent"
          key={`${name}-${index}`}
          lineCap="round"
          lineJoin="round"
          stroke="#fff"
          strokeScaleEnabled={false}
          strokeWidth={2.15}
        />
      ))}
    </Group>
  );
}

type MultiDragState = {
  initialPointer: { x: number; y: number };
  initialPositions: Map<string, { x: number; y: number }>;
};

/** Canvas that accepts drag-and-drop from the component palette. */
export function CanvasEditor({
  readOnly = false,
  placedItems,
  selectedItemId,
  onAddItem,
  onUpdateItem,
  onSelectItem,
  onMoveUp,
  onMoveDown,
  onMoveToFront,
  onMoveToBack,
  onDeleteItems,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const marqueeRef = useRef<Konva.Rect>(null);
  const multiDragRef = useRef<MultiDragState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { resolvedTheme } = useTheme();

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const [isMarqueeing, setIsMarqueeing] = useState(false);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);

  useResizeObserver(containerRef, (entry) => {
    setSize({
      width: entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width,
      height: entry.contentBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
    });
  });

  const colors = useMemo(
    () => getCanvasColors(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme],
  );

  const dismissContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const controller = new AbortController();
    window.addEventListener("click", dismissContextMenu, { signal: controller.signal });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") dismissContextMenu();
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [contextMenu, dismissContextMenu]);

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain") as PlacedItemType;
    if (!PLACEABLE_ITEMS.some((item) => item.label === type)) return;

    const stage = stageRef.current;
    if (!stage) return;

    const stageRect = stage.container().getBoundingClientRect();
    const x = Math.round((e.clientX - stageRect.left) * (stage.width() / stageRect.width));
    const y = Math.round((e.clientY - stageRect.top) * (stage.height() / stageRect.height));

    onAddItem(type, x - ITEM_DEFS[type].width / 2, y - ITEM_DEFS[type].height / 2);
  };

  const handleBackgroundMouseDown = () => {
    dismissContextMenu();
    if (readOnly) {
      onSelectItem(null);
      return;
    }
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    marqueeStartRef.current = { x: pos.x, y: pos.y };

    if (marqueeRef.current) {
      marqueeRef.current.visible(true);
      marqueeRef.current.x(pos.x);
      marqueeRef.current.y(pos.y);
      marqueeRef.current.width(0);
      marqueeRef.current.height(0);
      marqueeRef.current.getLayer()?.batchDraw();
    }
    setIsMarqueeing(true);
  };

  const handleBackgroundMouseMove = () => {
    if (!isMarqueeing) return;
    const pos = stageRef.current?.getPointerPosition();
    if (!pos || !marqueeStartRef.current || !marqueeRef.current) return;
    const start = marqueeStartRef.current;
    const x = Math.min(pos.x, start.x);
    const y = Math.min(pos.y, start.y);
    const w = Math.abs(pos.x - start.x);
    const h = Math.abs(pos.y - start.y);
    marqueeRef.current.x(x);
    marqueeRef.current.y(y);
    marqueeRef.current.width(w);
    marqueeRef.current.height(h);
    marqueeRef.current.getLayer()?.batchDraw();
  };

  const handleBackgroundMouseUp = () => {
    if (!isMarqueeing) return;
    setIsMarqueeing(false);

    if (marqueeRef.current) {
      marqueeRef.current.visible(false);
      marqueeRef.current.getLayer()?.batchDraw();
    }

    const start = marqueeStartRef.current;
    const end = stageRef.current?.getPointerPosition();
    marqueeStartRef.current = null;

    if (!start || !end) return;

    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    if (dx < 4 && dy < 4) {
      setSelectedItemIds(new Set());
      onSelectItem(null);
      return;
    }

    const r = normRect({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    const ids = placedItems.filter((item) => hitTest(item, r)).map((i) => i.id);

    if (ids.length > 0) {
      const newSet = new Set(ids);
      setSelectedItemIds(newSet);
      onSelectItem(ids[ids.length - 1]);
    } else {
      setSelectedItemIds(new Set());
    }
  };

  const handleItemClick = useCallback(
    (item: PlacedItem, e: Konva.KonvaEventObject<MouseEvent> | Konva.KonvaEventObject<TouchEvent>) => {
      dismissContextMenu();
      if (e.evt && "shiftKey" in e.evt && e.evt.shiftKey) {
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else {
        setSelectedItemIds(new Set([item.id]));
      }
      onSelectItem(item.id);
    },
    [dismissContextMenu, onSelectItem],
  );

  const handleItemContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>, item: PlacedItem) => {
      if (readOnly) return;
      e.evt.preventDefault();
      dismissContextMenu();
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, itemId: item.id });
    },
    [readOnly, dismissContextMenu],
  );

  const contextMenuItem = contextMenu ? placedItems.find((i) => i.id === contextMenu.itemId) : null;

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedItemIds);
    if (ids.length === 0) return;
    onDeleteItems?.(ids);
    setSelectedItemIds(new Set());
    dismissContextMenu();
  }, [selectedItemIds, onDeleteItems, dismissContextMenu]);

  const handleMoveUp = useCallback(() => {
    if (contextMenu) {
      onMoveUp?.(contextMenu.itemId);
      dismissContextMenu();
    }
  }, [contextMenu, onMoveUp, dismissContextMenu]);

  const handleMoveDown = useCallback(() => {
    if (contextMenu) {
      onMoveDown?.(contextMenu.itemId);
      dismissContextMenu();
    }
  }, [contextMenu, onMoveDown, dismissContextMenu]);

  const handleMoveToFront = useCallback(() => {
    if (contextMenu) {
      onMoveToFront?.(contextMenu.itemId);
      dismissContextMenu();
    }
  }, [contextMenu, onMoveToFront, dismissContextMenu]);

  const handleMoveToBack = useCallback(() => {
    if (contextMenu) {
      onMoveToBack?.(contextMenu.itemId);
      dismissContextMenu();
    }
  }, [contextMenu, onMoveToBack, dismissContextMenu]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnly) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = Array.from(selectedItemIds);
        if (ids.length > 0) {
          onDeleteItems?.(ids);
          setSelectedItemIds(new Set());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItemIds, readOnly, onDeleteItems]);

  const handleMultiDragStart = useCallback(
    (item: PlacedItem) => {
      if (selectedItemIds.size <= 1 || !selectedItemIds.has(item.id)) {
        multiDragRef.current = null;
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      multiDragRef.current = {
        initialPointer: pos,
        initialPositions: new Map(
          placedItems.filter((i) => selectedItemIds.has(i.id)).map((i) => [i.id, { x: i.x, y: i.y }]),
        ),
      };
    },
    [selectedItemIds, placedItems],
  );

  const handleMultiDragMove = useCallback(
    (item: PlacedItem) => {
      const state = multiDragRef.current;
      if (!state) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const dx = pos.x - state.initialPointer.x;
      const dy = pos.y - state.initialPointer.y;
      const layer = stage.getLayers()[0];
      if (!layer) return;
      selectedItemIds.forEach((id) => {
        if (id === item.id) return;
        const start = state.initialPositions.get(id);
        if (!start) return;
        const group = layer.findOne(`.placed-${id}`);
        if (group) {
          group.x(start.x + dx);
          group.y(start.y + dy);
        }
      });
      layer.batchDraw();
    },
    [selectedItemIds],
  );

  const handleDragEndWrapper = useCallback(
    (item: PlacedItem, e: Konva.KonvaEventObject<DragEvent>) => {
      const state = multiDragRef.current;
      if (!state) {
        onUpdateItem(item.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const dx = pos.x - state.initialPointer.x;
      const dy = pos.y - state.initialPointer.y;
      state.initialPositions.forEach((start, id) => {
        if (id === item.id) {
          onUpdateItem(id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
        } else {
          onUpdateItem(id, { x: Math.round(start.x + dx), y: Math.round(start.y + dy) });
        }
      });
      multiDragRef.current = null;
    },
    [onUpdateItem],
  );

  const handleZoneDragEnd = useCallback(
    (item: PlacedItem, e: Konva.KonvaEventObject<DragEvent>) => {
      const state = multiDragRef.current;
      if (!state) {
        onUpdateItem(item.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const dx = pos.x - state.initialPointer.x;
      const dy = pos.y - state.initialPointer.y;
      state.initialPositions.forEach((start, id) => {
        if (id === item.id) {
          onUpdateItem(id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
        } else {
          onUpdateItem(id, { x: Math.round(start.x + dx), y: Math.round(start.y + dy) });
        }
      });
      multiDragRef.current = null;
    },
    [onUpdateItem],
  );

  return (
    <div className="relative h-full w-full" onDragOver={handleDragOver} onDrop={handleDrop} ref={containerRef}>
      {size.width > 0 && size.height > 0 && (
        <Stage
          height={size.height}
          onMouseMove={handleBackgroundMouseMove}
          onMouseUp={handleBackgroundMouseUp}
          onTouchMove={handleBackgroundMouseMove}
          onTouchEnd={handleBackgroundMouseUp}
          ref={stageRef}
          width={size.width}
        >
          <Layer>
            <Rect
              fill={colors.background}
              height={size.height}
              onMouseDown={handleBackgroundMouseDown}
              onTouchStart={handleBackgroundMouseDown}
              width={size.width}
              x={0}
              y={0}
            />
            <Rect
              height={size.height}
              listening={false}
              stroke={colors.border}
              strokeWidth={1}
              width={size.width}
              x={0}
              y={0}
            />
            {placedItems.length === 0 && (
              <Text
                fill={colors.mutedForeground}
                fontFamily="Geist Variable, sans-serif"
                fontSize={14}
                text="Drag components from the palette to place them"
                x={size.width / 2 - 155}
                y={size.height / 2 - 10}
              />
            )}
            {placedItems.map((item) => (
              <PlacedShape
                isMultiSelected={selectedItemIds.has(item.id)}
                isSelected={item.id === selectedItemId}
                item={item}
                key={item.id}
                onContextMenu={(e) => handleItemContextMenu(e, item)}
                onDragEnd={(e) => handleDragEndWrapper(item, e)}
                onDragMove={() => handleMultiDragMove(item)}
                onDragStart={() => handleMultiDragStart(item)}
                onSelectItem={(e) => handleItemClick(item, e)}
                onUpdateItem={onUpdateItem}
                onZoneDragEnd={(e) => handleZoneDragEnd(item, e)}
                readOnly={readOnly}
              />
            ))}
          </Layer>
          {/* Marquee overlay layer — kept separate so batchDraw() only redraws this layer during selection drag, not the items layer. */}
          <Layer>
            <Rect
              dash={[4, 4]}
              fill="rgba(59, 130, 246, 0.08)"
              listening={false}
              ref={marqueeRef}
              stroke="rgba(59, 130, 246, 0.5)"
              strokeWidth={1}
              visible={false}
            />
          </Layer>
        </Stage>
      )}
      {contextMenu && (
        <div
          className="bg-popover text-popover-foreground ring-foreground/10 z-50 min-w-40 rounded-none border shadow-md ring-1"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenuItem && (
            <div className="border-muted/40 text-muted-foreground border-b px-2.5 py-1.5 text-[11px] font-medium">
              {contextMenuItem.name || contextMenuItem.type}
            </div>
          )}
          <div
            className="group/ctx-item hover:bg-accent hover:text-accent-foreground flex cursor-default items-center gap-2 px-2 py-1.5 text-xs select-none"
            onClick={handleMoveUp}
          >
            <ArrowUpIcon className="size-3.5" />
            Move Up
          </div>
          <div
            className="group/ctx-item hover:bg-accent hover:text-accent-foreground flex cursor-default items-center gap-2 px-2 py-1.5 text-xs select-none"
            onClick={handleMoveDown}
          >
            <ArrowDownIcon className="size-3.5" />
            Move Down
          </div>
          <div className="bg-border -mx-0 h-px" />
          <div
            className="group/ctx-item hover:bg-accent hover:text-accent-foreground flex cursor-default items-center gap-2 px-2 py-1.5 text-xs select-none"
            onClick={handleMoveToFront}
          >
            <ArrowUpToLineIcon className="size-3.5" />
            Bring to Front
          </div>
          <div
            className="group/ctx-item hover:bg-accent hover:text-accent-foreground flex cursor-default items-center gap-2 px-2 py-1.5 text-xs select-none"
            onClick={handleMoveToBack}
          >
            <ArrowDownToLineIcon className="size-3.5" />
            Send to Back
          </div>
          <div className="bg-border -mx-0 h-px" />
          <div
            className="group/ctx-item hover:bg-destructive/10 text-destructive hover:text-destructive flex cursor-default items-center gap-2 px-2 py-1.5 text-xs select-none"
            onClick={handleDeleteSelected}
          >
            <Trash2Icon className="size-3.5" />
            Delete
            {selectedItemIds.size > 1 && (
              <span className="text-muted-foreground ml-auto text-[10px]">{selectedItemIds.size}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders a single placed item on the Konva canvas. */
function PlacedShape({
  item,
  isSelected,
  isMultiSelected,
  readOnly = false,
  onUpdateItem,
  onSelectItem,
  onContextMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
  onZoneDragEnd,
}: {
  item: PlacedItem;
  isSelected: boolean;
  isMultiSelected?: boolean;
  readOnly?: boolean;
  onUpdateItem: (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => void;
  onSelectItem: (e: Konva.KonvaEventObject<MouseEvent> | Konva.KonvaEventObject<TouchEvent>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onDragStart?: () => void;
  onDragMove?: () => void;
  onDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onZoneDragEnd?: (e: Konva.KonvaEventObject<DragEvent>) => void;
}) {
  const def = { ...ITEM_DEFS[item.type], width: item.width, height: item.height };
  const [dragging, setDragging] = useState(false);
  const zoneRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const itemColor = String(item.props.iconColor ?? def.stroke);
  const fillColor = item.type === "Zone" ? hexToRgba(itemColor, 0.08) : itemColor;
  const strokeColor = darkenHex(itemColor, 0.15);
  const iconShape = String(item.props.iconShape ?? DEFAULT_ICON_SHAPES[item.type]);
  const iconName = isCanvasIconName(iconShape) ? iconShape : DEFAULT_ICON_SHAPES[item.type];

  const handleDragStart = useCallback(() => {
    setDragging(true);
    onDragStart?.();
  }, [onDragStart]);

  const handleDragMove = useCallback(() => {
    onDragMove?.();
  }, [onDragMove]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      setDragging(false);
      onDragEnd?.(e);
    },
    [onDragEnd],
  );

  const handleZoneDragEndInner = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      setDragging(false);
      onZoneDragEnd?.(e);
    },
    [onZoneDragEnd],
  );

  useIsomorphicLayoutEffect(() => {
    if (item.type !== "Zone" || !isSelected || readOnly) return;
    if (zoneRef.current && trRef.current) {
      trRef.current.nodes([zoneRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected, readOnly, item.type]);

  const handleZoneTransformEnd = useCallback(() => {
    const node = zoneRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onUpdateItem(item.id, {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.max(20, Math.round(node.width() * scaleX)),
      height: Math.max(20, Math.round(node.height() * scaleY)),
    });
  }, [item.id, onUpdateItem]);

  const showFocus = isSelected || isMultiSelected || dragging;
  const focusStroke = isSelected ? 2 : dragging ? 2 : 0;
  const R = def.width / 2;

  switch (item.type) {
    case "Zone":
      return (
        <>
          <Group
            draggable={!readOnly}
            height={def.height}
            name={`placed-${item.id}`}
            onClick={onSelectItem}
            onContextMenu={onContextMenu}
            onDragEnd={readOnly ? undefined : handleZoneDragEndInner}
            onDragMove={readOnly ? undefined : handleDragMove}
            onDragStart={readOnly ? undefined : handleDragStart}
            onTap={onSelectItem}
            ref={zoneRef}
            width={def.width}
            x={item.x}
            y={item.y}
          >
            <Rect
              cornerRadius={2}
              fill={isSelected ? hexToRgba(itemColor, 0.15) : fillColor}
              height={def.height}
              stroke={
                isSelected
                  ? lightenHex(itemColor, 0.2)
                  : isMultiSelected
                    ? itemColor
                    : dragging
                      ? lightenHex(itemColor, 0.2)
                      : strokeColor
              }
              strokeWidth={focusStroke || (isMultiSelected ? 1.5 : 1)}
              width={def.width}
            />
            <Text
              fill={strokeColor}
              fontFamily="Geist Variable, sans-serif"
              fontSize={11}
              text={item.name}
              x={8}
              y={6}
            />
            {isMultiSelected && !isSelected && (
              <Rect
                dash={[3, 2]}
                height={def.height}
                listening={false}
                stroke={itemColor}
                strokeWidth={1}
                width={def.width}
              />
            )}
            {isSelected && !readOnly && (
              <Rect
                cornerRadius={1}
                fill={lightenHex(itemColor, 0.2)}
                height={8}
                listening={false}
                opacity={0.4}
                width={8}
                x={def.width - 8}
                y={def.height - 8}
              />
            )}
          </Group>
          {isSelected && !readOnly && (
            <Transformer
              anchorCornerRadius={1}
              anchorFill="#fff"
              anchorSize={8}
              anchorStroke={lightenHex(itemColor, 0.2)}
              borderStroke={lightenHex(itemColor, 0.2)}
              borderStrokeWidth={1}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
              keepRatio={false}
              onTransformEnd={handleZoneTransformEnd}
              ref={trRef}
              rotateEnabled={false}
            />
          )}
        </>
      );

    case "CCTV":
      return (
        <Group
          draggable={!readOnly}
          name={`placed-${item.id}`}
          onClick={onSelectItem}
          onContextMenu={onContextMenu}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragMove={readOnly ? undefined : handleDragMove}
          onDragStart={readOnly ? undefined : handleDragStart}
          onTap={onSelectItem}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
            radius={R + (showFocus ? 4 : 0)}
            stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
            strokeWidth={focusStroke || (isMultiSelected ? 1.5 : 1)}
          />
          <CanvasItemIcon name={iconName} />
          {isMultiSelected && !isSelected && (
            <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} />
          )}
          {isSelected && !readOnly && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
          )}
        </Group>
      );

    case "Sensor":
      return (
        <Group
          draggable={!readOnly}
          name={`placed-${item.id}`}
          onClick={onSelectItem}
          onContextMenu={onContextMenu}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragMove={readOnly ? undefined : handleDragMove}
          onDragStart={readOnly ? undefined : handleDragStart}
          onTap={onSelectItem}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
            radius={R + (showFocus ? 4 : 0)}
            stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
            strokeWidth={focusStroke || (isMultiSelected ? 1.5 : 1)}
          />
          <CanvasItemIcon name={iconName} />
          {isMultiSelected && !isSelected && (
            <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} />
          )}
          {isSelected && !readOnly && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
          )}
        </Group>
      );

    case "Signal":
      return (
        <Group
          draggable={!readOnly}
          name={`placed-${item.id}`}
          onClick={onSelectItem}
          onContextMenu={onContextMenu}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragMove={readOnly ? undefined : handleDragMove}
          onDragStart={readOnly ? undefined : handleDragStart}
          onTap={onSelectItem}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
            radius={R + (showFocus ? 4 : 0)}
            stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
            strokeWidth={focusStroke || (isMultiSelected ? 1.5 : 1)}
          />
          <CanvasItemIcon name={iconName} />
          {isMultiSelected && !isSelected && (
            <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} />
          )}
          {isSelected && !readOnly && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
          )}
        </Group>
      );
  }
}
