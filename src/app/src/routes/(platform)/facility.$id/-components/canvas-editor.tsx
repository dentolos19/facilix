import type Konva from "konva";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Arc, Circle, Group, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowDownToLineIcon,
  ArrowUpToLineIcon,
  Trash2Icon,
} from "lucide-react";

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
    window.addEventListener("keydown", (e) => { if (e.key === "Escape") dismissContextMenu(); }, { signal: controller.signal });
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
          placedItems
            .filter((i) => selectedItemIds.has(i.id))
            .map((i) => [i.id, { x: i.x, y: i.y }]),
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
          className="z-50 min-w-40 rounded-none border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenuItem && (
            <div className="border-muted/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground border-b">
              {contextMenuItem.name || contextMenuItem.type}
            </div>
          )}
          <div
            className="group/ctx-item flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={handleMoveUp}
          >
            <ArrowUpIcon className="size-3.5" />
            Move Up
          </div>
          <div
            className="group/ctx-item flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={handleMoveDown}
          >
            <ArrowDownIcon className="size-3.5" />
            Move Down
          </div>
          <div className="-mx-0 h-px bg-border" />
          <div
            className="group/ctx-item flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={handleMoveToFront}
          >
            <ArrowUpToLineIcon className="size-3.5" />
            Bring to Front
          </div>
          <div
            className="group/ctx-item flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
            onClick={handleMoveToBack}
          >
            <ArrowDownToLineIcon className="size-3.5" />
            Send to Back
          </div>
          <div className="-mx-0 h-px bg-border" />
          <div
            className="group/ctx-item flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-xs hover:bg-destructive/10 text-destructive hover:text-destructive"
            onClick={handleDeleteSelected}
          >
            <Trash2Icon className="size-3.5" />
            Delete
            {selectedItemIds.size > 1 && (
              <span className="ml-auto text-[10px] text-muted-foreground">{selectedItemIds.size}</span>
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

    case "Marker":
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
          {iconShape === "diamond" && (
            <>
              <Rect
                fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
                height={def.height + (showFocus ? 8 : 0)}
                rotation={45}
                stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
                strokeWidth={focusStroke || 1}
                width={def.width + (showFocus ? 8 : 0)}
                x={-(def.width + (showFocus ? 8 : 0)) / 2}
                y={-(def.height + (showFocus ? 8 : 0)) / 2}
              />
              <Text
                fill="#fff"
                fontFamily="Geist Variable, sans-serif"
                fontSize={11}
                fontStyle="bold"
                text={item.props.label ? String(item.props.label).charAt(0).toUpperCase() : "M"}
                x={-5}
                y={-6}
              />
              {isMultiSelected && !isSelected && (
                <Rect
                  dash={[3, 3]}
                  height={def.height + 16}
                  listening={false}
                  rotation={45}
                  stroke={itemColor}
                  strokeWidth={1}
                  width={def.width + 16}
                  x={-(def.width + 16) / 2}
                  y={-(def.height + 16) / 2}
                />
              )}
              {isSelected && (
                <Rect
                  dash={[3, 3]}
                  height={def.height + 14}
                  listening={false}
                  rotation={45}
                  stroke={itemColor}
                  strokeWidth={1}
                  width={def.width + 14}
                  x={-(def.width + 14) / 2}
                  y={-(def.height + 14) / 2}
                />
              )}
            </>
          )}
          {iconShape === "pin" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (showFocus ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={focusStroke || 1}
                y={-4}
              />
              <Rect
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                height={8}
                rotation={45}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={focusStroke || 1}
                width={8}
                x={-4}
                y={R - 8}
              />
              <Circle fill="#fff" radius={R * 0.35} y={-4} />
              {isMultiSelected && !isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} y={-4} />
              )}
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} y={-4} />
              )}
            </>
          )}
          {iconShape === "star" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (showFocus ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={focusStroke || 1}
              />
              {[0, 72, 144, 216, 288].map((angle, i) => {
                const outerR = R * 0.55;
                const innerR = R * 0.25;
                return <Rect fill="#fff" height={innerR} key={i} rotation={angle} width={2} x={-1} y={-outerR} />;
              })}
              <Text
                fill="#fff"
                fontFamily="Geist Variable, sans-serif"
                fontSize={14}
                fontStyle="bold"
                text="★"
                x={-7}
                y={-9}
              />
              {isMultiSelected && !isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} />
              )}
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
              )}
            </>
          )}
          {iconShape === "flag" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (showFocus ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={focusStroke || 1}
              />
              <Rect fill="#fff" height={R * 0.8} width={2} x={-R * 0.2} y={-R * 0.4} />
              <Rect fill="#fff" height={R * 0.4} width={R * 0.45} x={-R * 0.15} y={-R * 0.4} />
              {isMultiSelected && !isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} />
              )}
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
              )}
            </>
          )}
          {iconShape === "circle" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (showFocus ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={focusStroke || 1}
              />
              <Text
                fill="#fff"
                fontFamily="Geist Variable, sans-serif"
                fontSize={11}
                fontStyle="bold"
                text={item.props.label ? String(item.props.label).charAt(0).toUpperCase() : "M"}
                x={-5}
                y={-6}
              />
              {isMultiSelected && !isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 8} stroke={itemColor} strokeWidth={1} />
              )}
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
              )}
            </>
          )}
        </Group>
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
          {iconShape === "camera" && (
            <>
              <Rect
                cornerRadius={2}
                fill={
                  isSelected
                    ? darkenHex(itemColor, 0.35)
                    : dragging
                      ? darkenHex(itemColor, 0.3)
                      : darkenHex(itemColor, 0.25)
                }
                height={R * 0.7}
                width={R * 0.9}
                x={-R * 0.45}
                y={-R * 0.35}
              />
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)}
                radius={R * 0.25}
                stroke={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                strokeWidth={1}
              />
              <Circle fill="#fbbf24" radius={2} x={R * 0.3} y={-R * 0.25} />
            </>
          )}
          {iconShape === "eye" && (
            <>
              <Rect
                cornerRadius={R * 0.5}
                fill={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                height={R * 0.55}
                width={R * 0.9}
                x={-R * 0.45}
                y={-R * 0.275}
              />
              <Circle fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)} radius={R * 0.22} />
              <Circle fill={isSelected ? darkenHex(itemColor, 0.4) : "#1a1a2e"} radius={R * 0.1} />
            </>
          )}
          {iconShape === "video" && (
            <>
              <Rect
                cornerRadius={2}
                fill={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                height={R * 0.65}
                width={R * 0.65}
                x={-R * 0.15}
                y={-R * 0.325}
              />
              <Rect
                fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)}
                height={R * 0.35}
                rotation={45}
                width={R * 0.35}
                x={-R * 0.1}
                y={-R * 0.05}
              />
              <Circle fill="#ef4444" radius={2.5} x={R * 0.25} y={-R * 0.2} />
            </>
          )}
          {iconShape === "monitoring" && (
            <>
              <Rect
                cornerRadius={2}
                fill={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                height={R * 0.6}
                width={R * 0.85}
                x={-R * 0.425}
                y={-R * 0.4}
              />
              <Rect
                cornerRadius={1}
                fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)}
                height={R * 0.4}
                width={R * 0.65}
                x={-R * 0.325}
                y={-R * 0.35}
              />
              <Rect fill="#fff" height={3} width={R * 0.3} x={-R * 0.15} y={R * 0.05} />
              <Rect fill="#fff" height={2} width={R * 0.5} x={-R * 0.25} y={R * 0.15} />
            </>
          )}
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
          {iconShape === "wifi" && (
            <>
              {[R * 0.35, R * 0.22, R * 0.1].map((r, i) => (
                <Arc
                  angle={90}
                  fill="#fff"
                  innerRadius={r * 0.5}
                  key={i}
                  outerRadius={r}
                  rotation={-45 + i * 22}
                  x={0}
                  y={0}
                />
              ))}
            </>
          )}
          {iconShape === "thermometer" && (
            <>
              <Rect cornerRadius={R * 0.15} fill="#fff" height={R * 0.7} width={R * 0.25} x={-R * 0.125} y={-R * 0.5} />
              <Circle fill="#fff" radius={R * 0.18} y={R * 0.05} />
              <Rect
                cornerRadius={R * 0.1}
                fill={isSelected ? itemColor : lightenHex(itemColor, 0.3)}
                height={R * 0.4}
                width={R * 0.12}
                x={-R * 0.06}
                y={-R * 0.2}
              />
              <Circle fill={isSelected ? itemColor : lightenHex(itemColor, 0.3)} radius={R * 0.12} y={R * 0.05} />
            </>
          )}
          {iconShape === "droplet" && (
            <>
              <Rect cornerRadius={R * 0.15} fill="#fff" height={R * 0.55} width={R * 0.4} x={-R * 0.2} y={-R * 0.15} />
              <Rect fill="#fff" height={R * 0.3} rotation={45} width={R * 0.3} x={-R * 0.05} y={-R * 0.45} />
            </>
          )}
          {iconShape === "wind" && (
            <>
              <Rect cornerRadius={2} fill="#fff" height={2.5} width={R * 0.6} x={-R * 0.3} y={-R * 0.25} />
              <Rect cornerRadius={2} fill="#fff" height={2.5} width={R * 0.45} x={-R * 0.15} y={-R * 0.05} />
              <Rect cornerRadius={2} fill="#fff" height={2.5} width={R * 0.55} x={-R * 0.25} y={R * 0.15} />
            </>
          )}
          {iconShape === "activity" && (
            <>
              <Rect fill="#fff" height={2} width={R * 0.3} x={-R * 0.4} y={0} />
              <Rect fill="#fff" height={2} rotation={-50} width={R * 0.15} x={-R * 0.1} y={-R * 0.15} />
              <Rect fill="#fff" height={2} rotation={50} width={R * 0.35} x={-R * 0.05} y={R * 0.05} />
              <Rect fill="#fff" height={2} width={R * 0.3} x={R * 0.15} y={0} />
            </>
          )}
          {iconShape === "sun" && (
            <>
              <Circle fill="#fff" radius={R * 0.22} />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                const innerDist = R * 0.32;
                const outerDist = R * 0.5;
                return (
                  <Rect
                    fill="#fff"
                    height={1.5}
                    key={i}
                    rotation={angle}
                    width={outerDist - innerDist}
                    x={innerDist}
                    y={-0.75}
                  />
                );
              })}
            </>
          )}
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
          {iconShape === "exclamation" && (
            <>
              <Rect cornerRadius={1} fill="#fff" height={R * 0.6} width={R * 0.2} x={-R * 0.1} y={-R * 0.5} />
              <Circle fill="#fff" radius={R * 0.1} x={0} y={R * 0.25} />
            </>
          )}
          {iconShape === "antenna" && (
            <>
              <Rect fill="#fff" height={R * 0.6} width={2} x={-1} y={-R * 0.35} />
              <Rect fill="#fff" height={2} width={R * 0.4} x={-R * 0.2} y={R * 0.15} />
              <Arc
                angle={60}
                fill="transparent"
                innerRadius={R * 0.25}
                outerRadius={R * 0.35}
                rotation={-30}
                stroke="#fff"
                strokeWidth={1.5}
              />
              <Arc
                angle={60}
                fill="transparent"
                innerRadius={R * 0.4}
                outerRadius={R * 0.5}
                rotation={-30}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </>
          )}
          {iconShape === "signal-bars" && (
            <>
              <Rect fill="#fff" height={R * 0.15} width={R * 0.12} x={-R * 0.35} y={R * 0.15} />
              <Rect fill="#fff" height={R * 0.28} width={R * 0.12} x={-R * 0.18} y={R * 0.02} />
              <Rect fill="#fff" height={R * 0.42} width={R * 0.12} x={-R * 0.01} y={-R * 0.12} />
              <Rect fill="#fff" height={R * 0.55} width={R * 0.12} x={R * 0.16} y={-R * 0.25} />
            </>
          )}
          {iconShape === "satellite" && (
            <>
              <Rect cornerRadius={R * 0.3} fill="#fff" height={R * 0.35} width={R * 0.5} x={-R * 0.25} y={-R * 0.175} />
              <Rect fill="#fff" height={2} rotation={-30} width={R * 0.3} x={0} y={-R * 0.05} />
              <Arc
                angle={40}
                fill="transparent"
                innerRadius={R * 0.3}
                outerRadius={R * 0.4}
                rotation={-20}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </>
          )}
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
