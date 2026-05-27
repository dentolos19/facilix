"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type Konva from "konva";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arc, Circle, Group, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import { toast } from "sonner";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "#/components/ui/menubar.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/components/ui/resizable.tsx";
import { Toggle } from "#/components/ui/toggle.tsx";
import type { PlacedItem, PlacedItemType } from "#/lib/types";
import {
  DEFAULT_PROPS,
  DEFAULT_SIZES,
  fromSnapshot,
  toCanvasData,
  toDevicePayloads,
} from "#/lib/types";
import { loadFacility, saveFacility } from "#/functions/facilities";

export const Route = createFileRoute("/(platform)/facility/$id/")({
  component: Page,
});

type EditMode = "monitor" | "edit";

export interface LogEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: PlacedItemType;
  timestamp: Date;
  level: "info" | "warn" | "error";
  message: string;
}

const CCTV_MESSAGES: [string, "info" | "warn" | "error"][] = [
  ["Motion detected — sector A4", "info"],
  ["Person identified at loading bay 2", "info"],
  ["Object left unattended near conveyor B", "warn"],
  ["Camera feed signal restored", "info"],
  ["Motion detected — north entrance", "info"],
  ["Unauthorised access attempt — door 7", "error"],
  ["Motion detected — warehouse aisle 3", "info"],
  ["Camera feed lost — sector C1", "error"],
  ["Vehicle detected at gate 1", "info"],
  ["PPE violation — missing hard hat", "warn"],
];

const SENSOR_MESSAGES: [string, "info" | "warn" | "error"][] = [
  ["Temperature: 24.5 °C — normal", "info"],
  ["Temperature: 31.2 °C — exceeds threshold", "warn"],
  ["Humidity: 62 % — normal", "info"],
  ["Air quality: PM2.5 = 45 µg/m³ — moderate", "info"],
  ["Vibration detected — machine #3", "warn"],
  ["Temperature: 22.1 °C — normal", "info"],
  ["Air quality: PM2.5 = 82 µg/m³ — unhealthy", "warn"],
  ["Temperature: 19.8 °C — normal", "info"],
  ["CO₂: 1200 ppm — elevated", "warn"],
  ["Gas leak detected — sensor unit alpha", "error"],
];

const SIGNAL_MESSAGES: [string, "info" | "warn" | "error"][] = [
  ["Signal strength: 92 % — excellent", "info"],
  ["Signal strength: 67 % — good", "info"],
  ["Signal strength: 34 % — weak", "warn"],
  ["Connection established — gateway delta", "info"],
  ["Packet loss: 12 % — checking link", "warn"],
  ["Signal strength: 45 % — moderate", "info"],
  ["Connection dropped — reconnecting", "error"],
  ["Frequency: 2.4 GHz — channel 6", "info"],
  ["Interference detected — switching channel", "warn"],
  ["Signal restored — all clear", "info"],
];

/** Generate a stable set of mock log entries for every IoT device. */
function generateMockLogs(items: PlacedItem[]): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = Date.now();

  for (const item of items) {
    if (item.type !== "CCTV" && item.type !== "Sensor" && item.type !== "Signal") continue;

    const pool =
      item.type === "CCTV" ? CCTV_MESSAGES
      : item.type === "Sensor" ? SENSOR_MESSAGES
      : SIGNAL_MESSAGES;
    // generate 4-7 logs per device with staggered timestamps
    const count = 4 + (item.id.charCodeAt(item.id.length - 1) % 4);
    for (let i = 0; i < count; i++) {
      const [msg, level] = pool[i % pool.length];
      logs.push({
        id: `${item.id}-log-${i}`,
        deviceId: item.id,
        deviceName: item.name,
        deviceType: item.type,
        timestamp: new Date(now - (count - i) * 90_000), // one every 90s
        level,
        message: msg,
      });
    }
  }

  return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function Page() {
  const navigate = useNavigate();
  const { id: facilityId } = Route.useParams();
  const [editMode, setEditMode] = useState<EditMode>("monitor");
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // ── Ref always pointing at latest placedItems (avoid stale closures) ────
  const placedItemsRef = useRef(placedItems);
  placedItemsRef.current = placedItems;

  // ── Undo/redo stacks ────────────────────────────────────────────────────
  const undoStackRef = useRef<PlacedItem[][]>([]);
  const redoStackRef = useRef<PlacedItem[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function saveSnapshot() {
    const current = placedItemsRef.current;
    undoStackRef.current.push(current.map((i) => ({ ...i, props: { ...i.props } })));
    setCanUndo(true);
    redoStackRef.current = []; // new action clears redo
    setCanRedo(false);
  }

  // ── Load persisted data on mount ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const snapshot = await loadFacility({ data: { id: facilityId } });
        const items = fromSnapshot(snapshot.canvasData, snapshot.devices);
        setPlacedItems(items);
      } catch (err) {
        toast.error("Failed to load facility data");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [facilityId]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const addPlacedItem = useCallback((type: PlacedItemType, x: number, y: number) => {
    saveSnapshot();
    const id = crypto.randomUUID();
    const size = DEFAULT_SIZES[type];
    setPlacedItems((prev) => [
      ...prev,
      {
        id,
        type,
        x,
        y,
        width: size.width,
        height: size.height,
        name: type,
        status: "online",
        notes: "",
        props: { ...DEFAULT_PROPS[type] },
      },
    ]);
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const logs = useMemo(() => generateMockLogs(placedItems), [placedItems]);

  const updatePlacedItem = useCallback(
    (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => {
      saveSnapshot();
      setPlacedItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
      setIsDirty(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const updatePlacedItemData = useCallback(
    (id: string, data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: Record<string, string | number> }>) => {
      saveSnapshot();
      setPlacedItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, ...data, props: data.props ? { ...item.props, ...data.props } : item.props }
            : item,
        ),
      );
      setIsDirty(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Undo / Redo ──────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack.pop()!;
    const current = placedItemsRef.current;
    redoStackRef.current.push(current.map((i) => ({ ...i, props: { ...i.props } })));
    setCanRedo(true);
    setPlacedItems(prev);
    setCanUndo(stack.length > 0);
    setIsDirty(true);
  }, []);

  const handleRedo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack.pop()!;
    const current = placedItemsRef.current;
    undoStackRef.current.push(current.map((i) => ({ ...i, props: { ...i.props } })));
    setCanUndo(true);
    setPlacedItems(next);
    setCanRedo(stack.length > 0);
    setIsDirty(true);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const canvasData = toCanvasData(placedItemsRef.current);
      const devices = toDevicePayloads(facilityId, placedItemsRef.current);
      await saveFacility({ data: { facilityId, canvasData, devices } });
      setIsDirty(false);
      toast.success("Facility saved");
    } catch (err) {
      toast.error("Failed to save facility");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [facilityId]);

  // ── Keyboard shortcuts (edit mode only) ─────────────────────────────────
  useEffect(() => {
    if (editMode !== "edit") return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((mod && e.key === "z" && e.shiftKey) || (mod && e.key === "y")) {
        e.preventDefault();
        handleRedo();
      }
      if (mod && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, handleUndo, handleRedo, handleSave]);

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden">
      {/* ── Menubar ── */}
      <Menubar className="shrink-0 rounded-none border-x-0 border-t-0">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={isSaving} onClick={handleSave}>
              Save{isDirty ? " *" : ""} <MenubarShortcut>⌘S</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Export… <MenubarShortcut>⇧⌘E</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={() => navigate({ to: "/dashboard" })} variant="destructive">
              Back to Dashboard
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled={!canUndo || editMode !== "edit"} onClick={handleUndo}>
              Undo <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled={!canRedo || editMode !== "edit"} onClick={handleRedo}>
              Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem>
              Delete <MenubarShortcut>⌫</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* ── Spacer + Monitor/Edit Switch ── */}
        <div aria-label="Edit mode" className="ml-auto flex items-center gap-0.5" role="group">
          <Toggle
            aria-label="Monitor mode"
            onPressedChange={() => setEditMode("monitor")}
            pressed={editMode === "monitor"}
            size="sm"
          >
            Monitor
          </Toggle>
          <Toggle
            aria-label="Edit mode"
            onPressedChange={() => setEditMode("edit")}
            pressed={editMode === "edit"}
            size="sm"
          >
            Edit
          </Toggle>
        </div>
      </Menubar>

      {/* ── Resizable Panels ── */}
      <ResizablePanelGroup className="flex-1" orientation="horizontal">
        {/* Left panel — logs (monitor) / component palette (edit) */}
        <ResizablePanel defaultSize={22} minSize={8}>
          {editMode === "monitor" ? (
            <MonitorLogsPanel logs={logs} onSelectDevice={setSelectedItemId} selectedDeviceId={selectedItemId} />
          ) : (
            <ComponentPalette />
          )}
        </ResizablePanel>

        <ResizableHandle
          className="w-1.5 data-[orientation=horizontal]:w-1.5 hover:bg-accent/50 transition-colors after:w-2"
          withHandle
        />

        {/* Center panel — Konva canvas (live in monitor, editable in edit) */}
        <ResizablePanel defaultSize={56} minSize={30}>
          <div className="relative h-full w-full">
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-background">
                <span className="text-xs text-muted-foreground/50">Loading facility…</span>
              </div>
            ) : (
              <CanvasEditor
                onAddItem={addPlacedItem}
                onSelectItem={setSelectedItemId}
                onUpdateItem={updatePlacedItem}
                placedItems={placedItems}
                readOnly={editMode === "monitor"}
                selectedItemId={selectedItemId}
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle
          className="w-1.5 data-[orientation=horizontal]:w-1.5 hover:bg-accent/50 transition-colors after:w-2"
          withHandle
        />

        {/* Right panel — properties (edit) / device logs (monitor) */}
        <ResizablePanel defaultSize={22} minSize={8}>
          {editMode === "monitor" ? (
            <DeviceLogPanel logs={logs} selectedDeviceId={selectedItemId} />
          ) : (
            <PropertiesPanel
              editMode={editMode}
              onSelectItem={setSelectedItemId}
              onUpdateItem={updatePlacedItemData}
              onUpdateLayout={updatePlacedItem}
              placedItems={placedItems}
              selectedItemId={selectedItemId}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/** Placeholder Konva canvas drawing an empty floorplate, themed to match the site. */
/**
 * Read the current theme CSS variable values from <html>.
 * These update reactively when next-themes toggles the .dark class.
 */
function getCanvasColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--background").trim(),
    border: style.getPropertyValue("--border").trim(),
    mutedForeground: style.getPropertyValue("--muted-foreground").trim(),
  };
}

interface CanvasEditorProps {
  readOnly?: boolean;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onAddItem: (type: PlacedItemType, x: number, y: number) => void;
  onUpdateItem: (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => void;
  onSelectItem: (id: string | null) => void;
}

/** Canvas that accepts drag-and-drop from the component palette. */
function CanvasEditor({
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

/** Visual dimensions and colours for each component type. */
const ITEM_DEFS: Record<
  PlacedItemType,
  { width: number; height: number; fill: string; stroke: string; label: string }
> = {
  Zone: { width: 140, height: 90, fill: "rgba(59,130,246,0.08)", stroke: "#3b82f6", label: "Zone" },
  Marker: { width: 36, height: 36, fill: "#f59e0b", stroke: "#d97706", label: "Marker" },
  CCTV: { width: 36, height: 36, fill: "#10b981", stroke: "#059669", label: "CCTV" },
  Sensor: { width: 36, height: 36, fill: "#8b5cf6", stroke: "#7c3aed", label: "Sensor" },
  Signal: { width: 36, height: 36, fill: "#06b6d4", stroke: "#0891b2", label: "Signal" },
};

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
            ref={zoneRef}
            draggable={!readOnly}
            height={def.height}
            name={`placed-${item.id}`}
            onClick={handleClick}
            onDragEnd={readOnly ? undefined : (e) => {
              setDragging(false);
              onUpdateItem(item.id, {
                x: Math.round(e.target.x()),
                y: Math.round(e.target.y()),
              });
            }}
            onDragStart={readOnly ? undefined : () => setDragging(true)}
            onTap={handleClick}
            width={def.width}
            x={item.x}
            y={item.y}
          >
            <Rect
              cornerRadius={2}
              fill={isSelected ? "rgba(59,130,246,0.15)" : def.fill}
              height={def.height}
              stroke={isSelected ? "#60a5fa" : dragging ? "#60a5fa" : def.stroke}
              strokeWidth={selectStroke}
              width={def.width}
            />
            <Text fill={def.stroke} fontFamily="Geist Variable, sans-serif" fontSize={11} text={item.name} x={8} y={6} />
            {isSelected && !readOnly && (
              <Rect
                width={8}
                height={8}
                x={def.width - 8}
                y={def.height - 8}
                fill="#60a5fa"
                opacity={0.4}
                cornerRadius={1}
                listening={false}
              />
            )}
          </Group>
          {isSelected && !readOnly && (
            <Transformer
              ref={trRef}
              borderStroke="#60a5fa"
              borderStrokeWidth={1}
              anchorFill="#fff"
              anchorStroke="#60a5fa"
              anchorSize={8}
              anchorCornerRadius={1}
              rotateEnabled={false}
              onTransformEnd={handleZoneTransformEnd}
              keepRatio={false}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
            />
          )}
        </>
      );

    case "Marker":
      // Diamond: rotated rect
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
          <Rect
            width={def.width + (isSelected ? 8 : 0)}
            height={def.height + (isSelected ? 8 : 0)}
            rotation={45}
            fill={isSelected ? "#fbbf24" : dragging ? "#fbbf24" : def.fill}
            stroke={isSelected ? "#f59e0b" : dragging ? "#f59e0b" : def.stroke}
            strokeWidth={selectWidth}
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
              width={def.width + 14}
              height={def.height + 14}
              rotation={45}
              stroke="#f59e0b"
              strokeWidth={1}
              dash={[3, 3]}
              listening={false}
              x={-(def.width + 14) / 2}
              y={-(def.height + 14) / 2}
            />
          )}
        </Group>
      );

    case "CCTV":
      // Circle with camera icon: rounded rect body + circle lens
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
            fill={isSelected ? "#34d399" : dragging ? "#34d399" : def.fill}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? "#10b981" : dragging ? "#10b981" : def.stroke}
            strokeWidth={selectStroke}
          />
          {/* Camera body - small rounded rect */}
          <Rect
            width={R * 0.9}
            height={R * 0.7}
            cornerRadius={2}
            fill={isSelected ? "#047857" : dragging ? "#059669" : "#065f46"}
            x={-R * 0.45}
            y={-R * 0.35}
          />
          {/* Camera lens */}
          <Circle
            radius={R * 0.25}
            fill={isSelected ? "#6ee7b7" : "#a7f3d0"}
            stroke={isSelected ? "#047857" : "#065f46"}
            strokeWidth={1}
          />
          {/* Flash / indicator dot */}
          <Circle radius={2} fill="#fbbf24" x={R * 0.3} y={-R * 0.25} />
          {isSelected && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke="#10b981" strokeWidth={1} />
          )}
        </Group>
      );

    case "Sensor":
      // Circle with Wi-Fi arcs
      return (
        <Group
          draggable={!readOnly}
          name={`placed-${item.id}`}
          onClick={handleClick}
          onTap={handleClick}
          onDragStart={readOnly ? undefined : () => setDragging(true)}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? "#a78bfa" : dragging ? "#a78bfa" : def.fill}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? "#8b5cf6" : dragging ? "#8b5cf6" : def.stroke}
            strokeWidth={selectStroke}
          />
          {/* Wi-Fi arcs */}
          {[R * 0.35, R * 0.22, R * 0.1].map((r, i) => (
            <Arc
              key={i}
              angle={90}
              fill="#fff"
              innerRadius={r * 0.5}
              outerRadius={r}
              rotation={-45 + i * 22}
              x={0}
              y={0}
            />
          ))}
          {isSelected && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke="#8b5cf6" strokeWidth={1} />
          )}
        </Group>
      );

    case "Signal":
      // Circle with exclamation mark
      return (
        <Group
          draggable={!readOnly}
          name={`placed-${item.id}`}
          onClick={handleClick}
          onTap={handleClick}
          onDragStart={readOnly ? undefined : () => setDragging(true)}
          onDragEnd={readOnly ? undefined : handleDragEnd}
          x={item.x}
          y={item.y}
        >
          <Circle
            fill={isSelected ? "#67e8f9" : dragging ? "#67e8f9" : def.fill}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? "#06b6d4" : dragging ? "#06b6d4" : def.stroke}
            strokeWidth={selectStroke}
          />
          {/* Exclamation mark: vertical bar + dot */}
          <Rect
            width={R * 0.2}
            height={R * 0.6}
            fill="#fff"
            cornerRadius={1}
            x={-R * 0.1}
            y={-R * 0.5}
          />
          <Circle radius={R * 0.1} fill="#fff" x={0} y={R * 0.25} />
          {isSelected && (
            <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke="#06b6d4" strokeWidth={1} />
          )}
        </Group>
      );
  }
}

/** Component palette shown in edit mode. */
const PLACEABLE_ITEMS: { label: PlacedItemType; icon: string; description: string }[] = [
  { label: "Zone", icon: "⊞", description: "Rooms, areas & locations" },
  { label: "Marker", icon: "⚐", description: "Labels, notes & alerts" },
  { label: "CCTV", icon: "◉", description: "AI cameras & live feeds" },
  { label: "Sensor", icon: "◈", description: "IoT environmental sensors" },
  { label: "Signal", icon: "⌔", description: "Connectivity & signal gateways" },
];

function ComponentPalette() {
  return (
    <div className="flex h-full flex-col gap-2 p-4">
      <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">Components</h3>
      <p className="text-[11px] leading-relaxed text-muted-foreground/60">Drag items onto the canvas to place them.</p>
      <div className="flex flex-col gap-1">
        {PLACEABLE_ITEMS.map((item) => (
          <button
            className="flex cursor-grab items-center gap-2 rounded-none px-2.5 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:bg-muted active:cursor-grabbing"
            draggable
            key={item.label}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.label);
              e.dataTransfer.effectAllowed = "copy";
            }}
            type="button"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Metadata for type-specific properties shown in the Properties panel. */
const PROPS_META: Record<PlacedItemType, { key: string; label: string; type: "text" | "number" }[]> = {
  Zone: [
    { key: "color", label: "Color", type: "text" },
  ],
  Marker: [
    { key: "label", label: "Label text", type: "text" },
    { key: "color", label: "Color", type: "text" },
  ],
  CCTV: [
    { key: "label", label: "Label", type: "text" },
    { key: "streamUrl", label: "Stream URL", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ],
  Sensor: [
    { key: "label", label: "Label", type: "text" },
    { key: "unit", label: "Unit", type: "text" },
    { key: "threshold", label: "Threshold", type: "number" },
  ],
  Signal: [
    { key: "label", label: "Label", type: "text" },
    { key: "strength", label: "Signal strength", type: "number" },
    { key: "frequency", label: "Frequency (MHz)", type: "number" },
  ],
};

interface PropertiesPanelProps {
  editMode: EditMode;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onUpdateItem: (
    id: string,
    data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: Record<string, string | number> }>,
  ) => void;
  onUpdateLayout: (id: string, patch: Partial<Pick<PlacedItem, "width" | "height">>) => void;
  onSelectItem: (id: string | null) => void;
}

/** Right-side properties panel. Shows selected item details in edit mode. */
function PropertiesPanel({
  editMode,
  placedItems,
  selectedItemId,
  onUpdateItem,
  onUpdateLayout,
}: PropertiesPanelProps) {
  const selected = placedItems.find((i) => i.id === selectedItemId) ?? null;

  const isReadOnly = editMode === "monitor";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">Properties</h3>

      {!selected && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 text-center">
          <span className="text-[11px] text-muted-foreground/50">
            {editMode === "monitor"
              ? "Switch to Edit mode to select components"
              : "Click a component on the canvas to view its properties"}
          </span>
        </div>
      )}

      {selected && (
        <div className="flex flex-col gap-3">
          {/* Read-only badge */}
          {isReadOnly && (
            <p className="rounded-none bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              Read-only — switch to Edit to modify
            </p>
          )}

          {/* ── Common fields ── */}
          <Field label="Name" readOnly={isReadOnly}>
            <Input
              className={isReadOnly ? "pointer-events-none opacity-60" : ""}
              onChange={(e) => onUpdateItem(selected.id, { name: e.target.value })}
              readOnly={isReadOnly}
              value={selected.name}
            />
          </Field>

          <Field label="Type">
            <div className="flex h-8 items-center rounded-none border border-input bg-muted/30 px-2.5 text-xs text-muted-foreground">
              {selected.type}
            </div>
          </Field>

          <Field label="Position" noGrow>
            <div className="flex gap-2">
              <Input
                className="w-1/2 pointer-events-none opacity-60"
                readOnly
                tabIndex={-1}
                value={Math.round(selected.x)}
              />
              <Input
                className="w-1/2 pointer-events-none opacity-60"
                readOnly
                tabIndex={-1}
                value={Math.round(selected.y)}
              />
            </div>
          </Field>

          {selected.type === "Zone" && (
            <Field label="Size" noGrow>
              <div className="flex gap-2">
                <Input
                  className={isReadOnly ? "w-1/2 pointer-events-none opacity-60" : "w-1/2"}
                  onChange={(e) => onUpdateLayout(selected.id, { width: Math.max(10, Number(e.target.value)) })}
                  readOnly={isReadOnly}
                  type="number"
                  value={selected.width}
                />
                <Input
                  className={isReadOnly ? "w-1/2 pointer-events-none opacity-60" : "w-1/2"}
                  onChange={(e) => onUpdateLayout(selected.id, { height: Math.max(10, Number(e.target.value)) })}
                  readOnly={isReadOnly}
                  type="number"
                  value={selected.height}
                />
              </div>
            </Field>
          )}

          <Field label="Notes" noGrow>
            <textarea
              className={`h-16 w-full min-w-0 resize-none rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 ${isReadOnly ? "pointer-events-none opacity-60" : ""}`}
              onChange={(e) => onUpdateItem(selected.id, { notes: e.target.value })}
              readOnly={isReadOnly}
              rows={3}
              value={selected.notes}
            />
          </Field>

          {/* ── Type-specific fields ── */}
          {PROPS_META[selected.type].length > 0 && (
            <div className="border-t border-border pt-2">
              <h4 className="mb-2 font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {selected.type} Properties
              </h4>
              <div className="flex flex-col gap-2">
                {PROPS_META[selected.type].map((meta) => (
                  <Field key={meta.key} label={meta.label} readOnly={isReadOnly}>
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) =>
                        onUpdateItem(selected.id, {
                          props: {
                            [meta.key]: meta.type === "number" ? Number(e.target.value) : e.target.value,
                          },
                        })
                      }
                      readOnly={isReadOnly}
                      type={meta.type}
                      value={String(selected.props[meta.key] ?? "")}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {/* ── Delete button in edit mode ── */}
          {editMode === "edit" && (
            <span className="block border-t border-border pt-2">
              <span
                className="inline-block cursor-pointer text-[11px] text-destructive transition-colors hover:text-destructive/80"
                onClick={() => {
                  // Handled via keyboard shortcut / context menu for now
                }}
                role="button"
                tabIndex={0}
              >
                Delete component
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Small wrapper for a labelled field row. */
function Field({
  label,
  noGrow,
  children,
  readOnly: _readOnly,
}: {
  label: string;
  readOnly?: boolean;
  noGrow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={noGrow ? "flex flex-col gap-1" : "flex flex-col gap-1"}>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ─── Monitor-mode panels ─────────────────────────────────────────────────

/** Time-ordered feed of all IoT device logs (monitor left panel). */
function MonitorLogsPanel({
  logs,
  selectedDeviceId,
  onSelectDevice,
}: {
  logs: LogEntry[];
  selectedDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-4">
      <h3 className="shrink-0 font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Device Logs
      </h3>

      {logs.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[11px] text-muted-foreground/50">No IoT devices placed</span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {logs.slice(0, 200).map((log) => (
          <button
            className={`flex flex-col gap-0.5 rounded-none px-2 py-1.5 text-left text-[11px] leading-relaxed transition-colors hover:bg-muted ${
              selectedDeviceId === log.deviceId ? "bg-muted" : ""
            }`}
            key={log.id}
            onClick={() => onSelectDevice(selectedDeviceId === log.deviceId ? null : log.deviceId)}
            type="button"
          >
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 font-medium text-foreground/80">{log.deviceName}</span>
              <LogLevelBadge level={log.level} />
            </div>
            <span className="text-muted-foreground/70">{log.message}</span>
            <span className="text-muted-foreground/40">{log.timestamp.toLocaleTimeString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Individual log entries for a single selected device (monitor right panel). */
function DeviceLogPanel({ logs, selectedDeviceId }: { logs: LogEntry[]; selectedDeviceId: string | null }) {
  const deviceLogs = useMemo(
    () => (selectedDeviceId ? logs.filter((l) => l.deviceId === selectedDeviceId) : []),
    [logs, selectedDeviceId],
  );

  const device = deviceLogs[0];

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-4">
      <h3 className="shrink-0 font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Device Details
      </h3>

      {!selectedDeviceId && (
        <div className="flex flex-1 items-center justify-center px-2 text-center">
          <span className="text-[11px] text-muted-foreground/50">Click an IoT device on the map to view its logs</span>
        </div>
      )}

      {selectedDeviceId && deviceLogs.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[11px] text-muted-foreground/50">No logs for this device</span>
        </div>
      )}

      {device && (
        <div className="flex flex-col gap-2">
          {/* Device summary */}
          <div className="rounded-none border border-border bg-muted/20 p-2">
            <p className="text-xs font-medium text-foreground">{device.deviceName}</p>
            <p className="text-[11px] text-muted-foreground/70">Type: {device.deviceType}</p>
            <p className="text-[11px] text-muted-foreground/70">Logs: {deviceLogs.length} entries</p>
          </div>

          {/* Individual log entries */}
          <h4 className="font-heading text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Log History
          </h4>
          <div className="flex flex-col gap-1">
            {deviceLogs.map((log) => (
              <div
                className="flex flex-col gap-0.5 rounded-none border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed"
                key={log.id}
                style={{
                  borderLeftColor: log.level === "error" ? "#ef4444" : log.level === "warn" ? "#f59e0b" : "#22c55e",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <LogLevelBadge level={log.level} />
                  <span className="text-muted-foreground/40">{log.timestamp.toLocaleTimeString()}</span>
                </div>
                <span className="text-foreground/80">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Small coloured badge for log severity. */
function LogLevelBadge({ level }: { level: LogEntry["level"] }) {
  const colors: Record<LogEntry["level"], string> = {
    info: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    error: "bg-red-500/15 text-red-600 dark:text-red-400",
  };
  return <span className={`rounded-none px-1 py-0.5 text-[10px] font-medium uppercase ${colors[level]}`}>{level}</span>;
}

/**
 * Lightweight ResizeObserver hook that fires on mount and on every resize.
 * Keeps the Konva Stage dimensions in sync with the panel.
 */
function useResizeObserver(
  ref: React.RefObject<HTMLDivElement | null>,
  onResize: (entry: ResizeObserverEntry) => void,
) {
  const callbackRef = useRef(onResize);
  callbackRef.current = onResize;

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(([entry]) => {
      callbackRef.current(entry);
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [ref]);
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
