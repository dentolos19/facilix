import type Konva from "konva";
import { useTheme } from "next-themes";
import { useCallback, useMemo, useRef, useState } from "react";
import { Arc, Circle, Group, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type { PlacedItem, PlacedItemType } from "#/lib/types";
import { DEFAULT_ICON_SHAPES, DEFAULT_PROPS } from "#/lib/types";
import { ITEM_DEFS, PLACEABLE_ITEMS } from "../-helpers/constants";
import { useIsomorphicLayoutEffect, useResizeObserver } from "../-helpers/hooks";
import type { CanvasEditorProps } from "../-helpers/types";
import { darkenHex, getCanvasColors, hexToRgba, lightenHex } from "../-helpers/utils";

/** Canvas that accepts drag-and-drop from the component palette. */
export function CanvasEditor({
  readOnly = false,
  placedItems,
  selectedItemId,
  onAddItem,
  onUpdateItem,
  onSelectItem,
}: CanvasEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { resolvedTheme } = useTheme();

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

  return (
    <div className="h-full w-full" onDragOver={handleDragOver} onDrop={handleDrop} ref={containerRef}>
      {size.width > 0 && size.height > 0 && (
        <Stage height={size.height} ref={stageRef} width={size.width}>
          <Layer>
            {/* Background fill — click to deselect */}
            <Rect
              fill={colors.background}
              height={size.height}
              onClick={() => onSelectItem(null)}
              onTap={() => onSelectItem(null)}
              width={size.width}
              x={0}
              y={0}
            />
            {/* Border outline */}
            <Rect
              height={size.height}
              listening={false}
              stroke={colors.border}
              strokeWidth={1}
              width={size.width}
              x={0}
              y={0}
            />
            {/* Empty state hint */}
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
            {/* Placed items */}
            {placedItems.map((item) => (
              <PlacedShape
                isSelected={item.id === selectedItemId}
                item={item}
                key={item.id}
                onSelectItem={onSelectItem}
                onUpdateItem={onUpdateItem}
                readOnly={readOnly}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

/** Renders a single placed item on the Konva canvas. */
function PlacedShape({
  item,
  isSelected,
  readOnly = false,
  onUpdateItem,
  onSelectItem,
}: {
  item: PlacedItem;
  isSelected: boolean;
  readOnly?: boolean;
  onUpdateItem: (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => void;
  onSelectItem: (id: string | null) => void;
}) {
  const def = { ...ITEM_DEFS[item.type], width: item.width, height: item.height };
  const [dragging, setDragging] = useState(false);
  const zoneRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  // Resolve dynamic color from props (falls back to ITEM_DEFS)
  const itemColor = String(item.props.iconColor ?? def.stroke);
  const fillColor = item.type === "Zone" ? hexToRgba(itemColor, 0.08) : itemColor;
  const strokeColor = darkenHex(itemColor, 0.15);
  const iconShape = String(item.props.iconShape ?? DEFAULT_ICON_SHAPES[item.type]);

  const handleClick = () => {
    onSelectItem(item.id);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    setDragging(false);
    onUpdateItem(item.id, {
      x: Math.round(e.target.x()),
      y: Math.round(e.target.y()),
    });
  };

  // ── Zone resize transformer ────────────────────────────────────────
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
    // Reset scale to 1 — we apply the final dimensions directly
    node.scaleX(1);
    node.scaleY(1);
    onUpdateItem(item.id, {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.max(20, Math.round(node.width() * scaleX)),
      height: Math.max(20, Math.round(node.height() * scaleY)),
    });
  }, [item.id, onUpdateItem]);

  const selectStroke = isSelected ? 2 : dragging ? 2 : 1;
  const selectWidth = isSelected ? 2 : dragging ? 2 : 1;

  const R = def.width / 2; // outer radius for circle-based components

  switch (item.type) {
    case "Zone":
      return (
        <>
          <Group
            draggable={!readOnly}
            height={def.height}
            name={`placed-${item.id}`}
            onClick={handleClick}
            onDragEnd={
              readOnly
                ? undefined
                : (e) => {
                    setDragging(false);
                    onUpdateItem(item.id, {
                      x: Math.round(e.target.x()),
                      y: Math.round(e.target.y()),
                    });
                  }
            }
            onDragStart={readOnly ? undefined : () => setDragging(true)}
            onTap={handleClick}
            ref={zoneRef}
            width={def.width}
            x={item.x}
            y={item.y}
          >
            <Rect
              cornerRadius={2}
              fill={isSelected ? hexToRgba(itemColor, 0.15) : fillColor}
              height={def.height}
              stroke={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : strokeColor}
              strokeWidth={selectStroke}
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
          onClick={handleClick}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragStart={readOnly ? undefined : () => setDragging(true)}
          onTap={handleClick}
          x={item.x}
          y={item.y}
        >
          {iconShape === "diamond" && (
            <>
              <Rect
                fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
                height={def.height + (isSelected ? 8 : 0)}
                rotation={45}
                stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
                strokeWidth={selectWidth}
                width={def.width + (isSelected ? 8 : 0)}
                x={-(def.width + (isSelected ? 8 : 0)) / 2}
                y={-(def.height + (isSelected ? 8 : 0)) / 2}
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
              {/* Map pin shape */}
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (isSelected ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={selectWidth}
                y={-4}
              />
              {/* Pin point triangle via a small rect */}
              <Rect
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                height={8}
                rotation={45}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={selectWidth}
                width={8}
                x={-4}
                y={R - 8}
              />
              <Circle fill="#fff" radius={R * 0.35} y={-4} />
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} y={-4} />
              )}
            </>
          )}
          {iconShape === "star" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (isSelected ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={selectWidth}
              />
              {/* Star: 5 small triangles arranged in a star pattern */}
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
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
              )}
            </>
          )}
          {iconShape === "flag" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (isSelected ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={selectWidth}
              />
              {/* Flag pole */}
              <Rect fill="#fff" height={R * 0.8} width={2} x={-R * 0.2} y={-R * 0.4} />
              {/* Flag body */}
              <Rect fill="#fff" height={R * 0.4} width={R * 0.45} x={-R * 0.15} y={-R * 0.4} />
              {isSelected && (
                <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
              )}
            </>
          )}
          {iconShape === "circle" && (
            <>
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.2) : fillColor}
                radius={R + (isSelected ? 4 : 0)}
                stroke={isSelected ? itemColor : strokeColor}
                strokeWidth={selectWidth}
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
          onClick={handleClick}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragStart={readOnly ? undefined : () => setDragging(true)}
          onTap={handleClick}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
            strokeWidth={selectStroke}
          />
          {iconShape === "camera" && (
            <>
              {/* Camera body */}
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
              {/* Camera lens */}
              <Circle
                fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)}
                radius={R * 0.25}
                stroke={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                strokeWidth={1}
              />
              {/* Flash / indicator dot */}
              <Circle fill="#fbbf24" radius={2} x={R * 0.3} y={-R * 0.25} />
            </>
          )}
          {iconShape === "eye" && (
            <>
              {/* Eye outer shape - horizontal ellipse via scaled circle */}
              <Rect
                cornerRadius={R * 0.5}
                fill={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                height={R * 0.55}
                width={R * 0.9}
                x={-R * 0.45}
                y={-R * 0.275}
              />
              {/* Iris */}
              <Circle fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)} radius={R * 0.22} />
              {/* Pupil */}
              <Circle fill={isSelected ? darkenHex(itemColor, 0.4) : "#1a1a2e"} radius={R * 0.1} />
            </>
          )}
          {iconShape === "video" && (
            <>
              {/* Video camera body */}
              <Rect
                cornerRadius={2}
                fill={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                height={R * 0.65}
                width={R * 0.65}
                x={-R * 0.15}
                y={-R * 0.325}
              />
              {/* Lens triangle (pointing right) */}
              <Rect
                fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)}
                height={R * 0.35}
                rotation={45}
                width={R * 0.35}
                x={-R * 0.1}
                y={-R * 0.05}
              />
              {/* Recording dot */}
              <Circle fill="#ef4444" radius={2.5} x={R * 0.25} y={-R * 0.2} />
            </>
          )}
          {iconShape === "monitor" && (
            <>
              {/* Monitor body */}
              <Rect
                cornerRadius={2}
                fill={isSelected ? darkenHex(itemColor, 0.35) : darkenHex(itemColor, 0.25)}
                height={R * 0.6}
                width={R * 0.85}
                x={-R * 0.425}
                y={-R * 0.4}
              />
              {/* Screen */}
              <Rect
                cornerRadius={1}
                fill={isSelected ? lightenHex(itemColor, 0.4) : lightenHex(itemColor, 0.3)}
                height={R * 0.4}
                width={R * 0.65}
                x={-R * 0.325}
                y={-R * 0.35}
              />
              {/* Stand */}
              <Rect fill="#fff" height={3} width={R * 0.3} x={-R * 0.15} y={R * 0.05} />
              <Rect fill="#fff" height={2} width={R * 0.5} x={-R * 0.25} y={R * 0.15} />
            </>
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
          onClick={handleClick}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragStart={readOnly ? undefined : () => setDragging(true)}
          onTap={handleClick}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
            strokeWidth={selectStroke}
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
              {/* Thermometer body */}
              <Rect cornerRadius={R * 0.15} fill="#fff" height={R * 0.7} width={R * 0.25} x={-R * 0.125} y={-R * 0.5} />
              {/* Bulb */}
              <Circle fill="#fff" radius={R * 0.18} y={R * 0.05} />
              {/* Mercury */}
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
              {/* Water droplet */}
              <Rect cornerRadius={R * 0.15} fill="#fff" height={R * 0.55} width={R * 0.4} x={-R * 0.2} y={-R * 0.15} />
              {/* Droplet top point - approximated with a small rect */}
              <Rect fill="#fff" height={R * 0.3} rotation={45} width={R * 0.3} x={-R * 0.05} y={-R * 0.45} />
            </>
          )}
          {iconShape === "wind" && (
            <>
              {/* Wind lines */}
              <Rect cornerRadius={2} fill="#fff" height={2.5} width={R * 0.6} x={-R * 0.3} y={-R * 0.25} />
              <Rect cornerRadius={2} fill="#fff" height={2.5} width={R * 0.45} x={-R * 0.15} y={-R * 0.05} />
              <Rect cornerRadius={2} fill="#fff" height={2.5} width={R * 0.55} x={-R * 0.25} y={R * 0.15} />
            </>
          )}
          {iconShape === "activity" && (
            <>
              {/* Activity/pulse line */}
              <Rect fill="#fff" height={2} width={R * 0.3} x={-R * 0.4} y={0} />
              <Rect fill="#fff" height={2} rotation={-50} width={R * 0.15} x={-R * 0.1} y={-R * 0.15} />
              <Rect fill="#fff" height={2} rotation={50} width={R * 0.35} x={-R * 0.05} y={R * 0.05} />
              <Rect fill="#fff" height={2} width={R * 0.3} x={R * 0.15} y={0} />
            </>
          )}
          {iconShape === "sun" && (
            <>
              {/* Sun center */}
              <Circle fill="#fff" radius={R * 0.22} />
              {/* Sun rays */}
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
          onClick={handleClick}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          onDragStart={readOnly ? undefined : () => setDragging(true)}
          onTap={handleClick}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? lightenHex(itemColor, 0.2) : dragging ? lightenHex(itemColor, 0.2) : fillColor}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? itemColor : dragging ? itemColor : strokeColor}
            strokeWidth={selectStroke}
          />
          {iconShape === "exclamation" && (
            <>
              <Rect cornerRadius={1} fill="#fff" height={R * 0.6} width={R * 0.2} x={-R * 0.1} y={-R * 0.5} />
              <Circle fill="#fff" radius={R * 0.1} x={0} y={R * 0.25} />
            </>
          )}
          {iconShape === "antenna" && (
            <>
              {/* Antenna pole */}
              <Rect fill="#fff" height={R * 0.6} width={2} x={-1} y={-R * 0.35} />
              {/* Antenna base */}
              <Rect fill="#fff" height={2} width={R * 0.4} x={-R * 0.2} y={R * 0.15} />
              {/* Signal arcs */}
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
              {/* Signal bars - ascending height */}
              <Rect fill="#fff" height={R * 0.15} width={R * 0.12} x={-R * 0.35} y={R * 0.15} />
              <Rect fill="#fff" height={R * 0.28} width={R * 0.12} x={-R * 0.18} y={R * 0.02} />
              <Rect fill="#fff" height={R * 0.42} width={R * 0.12} x={-R * 0.01} y={-R * 0.12} />
              <Rect fill="#fff" height={R * 0.55} width={R * 0.12} x={R * 0.16} y={-R * 0.25} />
            </>
          )}
          {iconShape === "satellite" && (
            <>
              {/* Satellite dish */}
              <Rect cornerRadius={R * 0.3} fill="#fff" height={R * 0.35} width={R * 0.5} x={-R * 0.25} y={-R * 0.175} />
              {/* Antenna arm */}
              <Rect fill="#fff" height={2} rotation={-30} width={R * 0.3} x={0} y={-R * 0.05} />
              {/* Signal waves */}
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
          {isSelected && !readOnly && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke={itemColor} strokeWidth={1} />
          )}
        </Group>
      );
  }
}
