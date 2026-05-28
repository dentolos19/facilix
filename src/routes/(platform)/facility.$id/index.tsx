"use client";

import { useHotkeys } from "@tanstack/react-hotkeys";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type Konva from "konva";
import { BoxIcon, EyeIcon, Grid3x3Icon, Loader2, MapPinIcon, PencilIcon, RadioIcon, Save, SettingsIcon, Trash2, WifiIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arc, Circle, Group, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import { toast } from "sonner";
import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog.tsx";
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/components/ui/resizable.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select.tsx";
import { deleteFacility, loadFacility, saveFacility } from "#/functions/facilities";
import type { PlacedItem, PlacedItemType } from "#/lib/types";
import {
  DEFAULT_PROPS,
  DEFAULT_SIZES,
  fromSnapshot,
  toCanvasData,
  toDevicePayloads,
  toZonePayloads,
} from "#/lib/types";

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

    const pool = item.type === "CCTV" ? CCTV_MESSAGES : item.type === "Sensor" ? SENSOR_MESSAGES : SIGNAL_MESSAGES;
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
  const [facilityName, setFacilityName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        setFacilityName(snapshot.name);
        setSettingsName(snapshot.name);
        const items = fromSnapshot(snapshot.canvasData, snapshot.zones, snapshot.devices);
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
        zoneId: null,
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

  const removePlacedItem = useCallback((id: string) => {
    saveSnapshot();
    setPlacedItems((prev) => prev.filter((item) => item.id !== id));
    setSelectedItemId((prev) => (prev === id ? null : prev));
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSave = useCallback(async ({ silent = false } = {}) => {
    setIsSaving(true);
    try {
      const items = placedItemsRef.current;
      const canvasData = toCanvasData(items);
      const zones = toZonePayloads(facilityId, items);
      const devices = toDevicePayloads(facilityId, items);
      await saveFacility({ data: { facilityId, name: facilityName, canvasData, zones, devices } });
      setIsDirty(false);
      if (!silent) toast.success("Facility saved");
    } catch (err) {
      toast.error("Failed to save facility");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [facilityId, facilityName]);

  // ── Auto-save (2 s debounce) ────────────────────────────────────────────
  useEffect(() => {
    if (!isDirty || editMode !== "edit" || isSaving) return;
    const timer = setTimeout(() => {
      handleSave({ silent: true });
    }, 2000);
    return () => clearTimeout(timer);
  }, [isDirty, editMode, isSaving, handleSave]);

  // ── Warn before closing tab with unsaved changes ───────────────────────
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handleSettingsSave = useCallback(async () => {
    if (!settingsName.trim()) return;
    setIsSaving(true);
    try {
      const items = placedItemsRef.current;
      const canvasData = toCanvasData(items);
      const zones = toZonePayloads(facilityId, items);
      const devices = toDevicePayloads(facilityId, items);
      await saveFacility({
        data: { facilityId, name: settingsName.trim(), canvasData, zones, devices },
      });
      setFacilityName(settingsName.trim());
      setSettingsOpen(false);
      setIsDirty(false);
      toast.success("Facility settings saved");
    } catch (err) {
      toast.error("Failed to save settings");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [facilityId, settingsName]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await deleteFacility({ data: { id: facilityId } });
      setConfirmDelete(false);
      toast.success("Facility deleted");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error("Failed to delete facility");
      console.error(err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [facilityId, navigate]);

  // ── Keyboard shortcuts (edit mode only) ─────────────────────────────────
  useHotkeys([
    { hotkey: "Mod+Z", callback: () => handleUndo(), options: { enabled: editMode === "edit" && canUndo } },
    { hotkey: "Mod+Shift+Z", callback: () => handleRedo(), options: { enabled: editMode === "edit" && canRedo } },
    { hotkey: "Mod+Y", callback: () => handleRedo(), options: { enabled: editMode === "edit" && canRedo } },
    { hotkey: "Mod+S", callback: () => handleSave(), options: { enabled: editMode === "edit" } },
  ]);

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden">
      {/* ── Menubar ── */}
      <Menubar className="shrink-0 rounded-none border-x-0 border-t-0">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            {editMode === "edit" && (
              <>
                <MenubarItem disabled={isSaving} onClick={() => handleSave()}>
                  Save{isDirty ? " *" : ""} <MenubarShortcut>⌘S</MenubarShortcut>
                </MenubarItem>
                <MenubarSeparator />
              </>
            )}
            <MenubarItem>
              Export… <MenubarShortcut>⇧⌘E</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              onClick={() => {
                if (isDirty) handleSave({ silent: true });
                navigate({ to: "/dashboard" });
              }}
              variant="destructive"
            >
              Back to Dashboard
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {editMode === "edit" && (
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled={!canUndo} onClick={handleUndo}>
                Undo <MenubarShortcut>⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!canRedo} onClick={handleRedo}>
                Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                Delete <MenubarShortcut>⌫</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        )}

        {/* ── Spacer + save + mode toggle + settings ── */}
        <div className="ml-auto flex items-center gap-0.5">
          {editMode === "edit" && (
            <Button
              aria-label={isSaving ? "Saving…" : "Save facility"}
              disabled={isSaving}
              onClick={() => handleSave()}
              size="icon-sm"
              variant="ghost"
              className="relative"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isDirty && !isSaving && (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500" />
              )}
            </Button>
          )}
          <Button
            aria-label={editMode === "monitor" ? "Switch to Edit mode" : "Switch to Monitor mode"}
            onClick={() => {
              if (editMode === "edit" && isDirty) handleSave({ silent: true });
              setEditMode(editMode === "monitor" ? "edit" : "monitor");
            }}
            size="icon-sm"
            variant="ghost"
          >
            {editMode === "monitor" ? <PencilIcon /> : <EyeIcon />}
          </Button>
          <Dialog
            onOpenChange={(open) => {
              setSettingsOpen(open);
              setConfirmDelete(false);
              if (open) setSettingsName(facilityName);
            }}
            open={settingsOpen}
          >
            <DialogTrigger asChild>
              <Button aria-label="Settings" size="icon-sm" variant="ghost">
                <SettingsIcon />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Facility Settings</DialogTitle>
                <DialogDescription>Edit facility metadata and preferences.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 p-1">
                <Field label="Facility name">
                  <Input
                    onChange={(e) => setSettingsName(e.target.value)}
                    placeholder="Enter facility name"
                    value={settingsName}
                  />
                </Field>
              </div>
              <DialogFooter>
                <div className="flex w-full items-center justify-between">
                  <Button
                    disabled={deleting}
                    onClick={() => {
                      if (!confirmDelete) {
                        setConfirmDelete(true);
                      } else {
                        handleDelete();
                      }
                    }}
                    size="sm"
                    variant="destructive"
                  >
                    {deleting ? "Deleting…" : confirmDelete ? "Confirm delete?" : "Delete facility"}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setSettingsOpen(false);
                        setConfirmDelete(false);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button disabled={!settingsName.trim() || isSaving} onClick={handleSettingsSave} size="sm">
                      {isSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
              onDeleteItem={removePlacedItem}
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
              fill={isSelected ? "rgba(59,130,246,0.15)" : def.fill}
              height={def.height}
              stroke={isSelected ? "#60a5fa" : dragging ? "#60a5fa" : def.stroke}
              strokeWidth={selectStroke}
              width={def.width}
            />
            <Text
              fill={def.stroke}
              fontFamily="Geist Variable, sans-serif"
              fontSize={11}
              text={item.name}
              x={8}
              y={6}
            />
            {isSelected && !readOnly && (
              <Rect
                cornerRadius={1}
                fill="#60a5fa"
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
              anchorStroke="#60a5fa"
              borderStroke="#60a5fa"
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
            fill={isSelected ? "#fbbf24" : dragging ? "#fbbf24" : def.fill}
            height={def.height + (isSelected ? 8 : 0)}
            rotation={45}
            stroke={isSelected ? "#f59e0b" : dragging ? "#f59e0b" : def.stroke}
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
              stroke="#f59e0b"
              strokeWidth={1}
              width={def.width + 14}
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
            cornerRadius={2}
            fill={isSelected ? "#047857" : dragging ? "#059669" : "#065f46"}
            height={R * 0.7}
            width={R * 0.9}
            x={-R * 0.45}
            y={-R * 0.35}
          />
          {/* Camera lens */}
          <Circle
            fill={isSelected ? "#6ee7b7" : "#a7f3d0"}
            radius={R * 0.25}
            stroke={isSelected ? "#047857" : "#065f46"}
            strokeWidth={1}
          />
          {/* Flash / indicator dot */}
          <Circle fill="#fbbf24" radius={2} x={R * 0.3} y={-R * 0.25} />
          {isSelected && <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke="#10b981" strokeWidth={1} />}
        </Group>
      );

    case "Sensor":
      // Circle with Wi-Fi arcs
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
            fill={isSelected ? "#a78bfa" : dragging ? "#a78bfa" : def.fill}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? "#8b5cf6" : dragging ? "#8b5cf6" : def.stroke}
            strokeWidth={selectStroke}
          />
          {/* Wi-Fi arcs */}
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
          {isSelected && <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke="#8b5cf6" strokeWidth={1} />}
        </Group>
      );

    case "Signal":
      // Circle with exclamation mark
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
            fill={isSelected ? "#67e8f9" : dragging ? "#67e8f9" : def.fill}
            radius={R + (isSelected ? 4 : 0)}
            stroke={isSelected ? "#06b6d4" : dragging ? "#06b6d4" : def.stroke}
            strokeWidth={selectStroke}
          />
          {/* Exclamation mark: vertical bar + dot */}
          <Rect cornerRadius={1} fill="#fff" height={R * 0.6} width={R * 0.2} x={-R * 0.1} y={-R * 0.5} />
          <Circle fill="#fff" radius={R * 0.1} x={0} y={R * 0.25} />
          {isSelected && <Circle dash={[3, 3]} listening={false} radius={R + 6} stroke="#06b6d4" strokeWidth={1} />}
        </Group>
      );
  }
}

/** Component palette shown in edit mode. */
const PLACEABLE_ITEMS: {
  label: PlacedItemType;
  icon: React.FC<{ className?: string }>;
  description: string;
  color: string;
  bgColor: string;
}[] = [
  {
    label: "Zone",
    icon: Grid3x3Icon,
    description: "Rooms, areas & locations",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    label: "Marker",
    icon: MapPinIcon,
    description: "Labels, notes & alerts",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    label: "CCTV",
    icon: BoxIcon,
    description: "AI cameras & live feeds",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    label: "Sensor",
    icon: WifiIcon,
    description: "IoT environmental sensors",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    label: "Signal",
    icon: RadioIcon,
    description: "Connectivity & gateways",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
];

function ComponentPalette() {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="space-y-1">
        <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">Components</h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground/60">Drag items onto the canvas to place them.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {PLACEABLE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className="group flex cursor-grab items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-all hover:bg-muted/80 hover:shadow-sm active:cursor-grabbing active:scale-[0.98]"
              draggable
              key={item.label}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.label);
                e.dataTransfer.effectAllowed = "copy";
              }}
              type="button"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.bgColor} transition-colors group-hover:scale-105`}
              >
                <Icon className={`h-4 w-4 ${item.color}`} />
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground/90">{item.label}</span>
                <span className="text-[10px] leading-tight text-muted-foreground/60">{item.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PropertiesPanelProps {
  editMode: EditMode;
  placedItems: PlacedItem[];
  selectedItemId: string | null;
  onUpdateItem: (
    id: string,
    data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: Record<string, string | number> }>,
  ) => void;
  onUpdateLayout: (id: string, patch: Partial<Pick<PlacedItem, "width" | "height">>) => void;
  onDeleteItem: (id: string) => void;
}

/** Right-side properties panel. Shows selected item details in edit mode. */
function PropertiesPanel({
  editMode,
  placedItems,
  selectedItemId,
  onUpdateItem,
  onUpdateLayout,
  onDeleteItem,
}: PropertiesPanelProps) {
  const selected = placedItems.find((i) => i.id === selectedItemId) ?? null;
  const isReadOnly = editMode === "monitor";

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      {/* ── Header with title and delete button ── */}
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h3 className="font-heading text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Properties
        </h3>
        {selected && editMode === "edit" && (
          <Button
            aria-label="Delete component"
            onClick={() => onDeleteItem(selected.id)}
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

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
        <Accordion className="flex-1" defaultValue={["basic-info"]} type="multiple">
          {/* ── Section 1: Basic Information (all types) ── */}
          <AccordionItem value="basic-info">
            <AccordionTrigger>Basic Information</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2">
                {isReadOnly && (
                  <p className="rounded-none bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    Read-only — switch to Edit to modify
                  </p>
                )}

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

                <Field label="Color">
                  <div className="flex gap-2">
                    <input
                      className="h-8 w-10 cursor-pointer rounded-none border border-input bg-transparent p-0.5 disabled:pointer-events-none disabled:opacity-60"
                      disabled={isReadOnly}
                      onChange={(e) => onUpdateItem(selected.id, { props: { color: e.target.value } })}
                      type="color"
                      value={String(selected.props.color ?? "#3b82f6")}
                    />
                    <Input
                      className={isReadOnly ? "flex-1 pointer-events-none opacity-60" : "flex-1"}
                      onChange={(e) => onUpdateItem(selected.id, { props: { color: e.target.value } })}
                      readOnly={isReadOnly}
                      value={String(selected.props.color ?? "")}
                    />
                  </div>
                </Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Section 2: Data Source (varies by component type) ── */}
          {selected.type === "Marker" && (
            <AccordionItem value="data-source">
              <AccordionTrigger>Data Source</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <Field label="Label">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { label: e.target.value } })}
                      placeholder="Short display text"
                      readOnly={isReadOnly}
                      value={String(selected.props.label ?? "")}
                    />
                  </Field>
                  <Field label="Marker Type">
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => onUpdateItem(selected.id, { props: { markerType: value } })}
                      value={String(selected.props.markerType ?? "")}
                    >
                      <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="alert">Alert</SelectItem>
                        <SelectItem value="danger">Danger</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {selected.type === "CCTV" && (
            <AccordionItem value="data-source">
              <AccordionTrigger>Data Source</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <Field label="Device ID">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { deviceId: e.target.value } })}
                      placeholder="e.g. cam-warehouse-01"
                      readOnly={isReadOnly}
                      value={String(selected.props.deviceId ?? "")}
                    />
                  </Field>
                  <Field label="Stream URL">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { streamUrl: e.target.value } })}
                      placeholder="rtsp://192.168.1.100/stream1"
                      readOnly={isReadOnly}
                      value={String(selected.props.streamUrl ?? "")}
                    />
                  </Field>
                  <Field label="Status">
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => onUpdateItem(selected.id, { props: { status: value } })}
                      value={String(selected.props.status ?? "")}
                    >
                      <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Protocol">
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => onUpdateItem(selected.id, { props: { protocol: value } })}
                      value={String(selected.props.protocol ?? "")}
                    >
                      <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                        <SelectValue placeholder="Select protocol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rtsp">RTSP</SelectItem>
                        <SelectItem value="http-flv">HTTP-FLV</SelectItem>
                        <SelectItem value="hls">HLS</SelectItem>
                        <SelectItem value="onvif">ONVIF</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Authentication">
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => onUpdateItem(selected.id, { props: { auth: value } })}
                      value={String(selected.props.auth ?? "")}
                    >
                      <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                        <SelectValue placeholder="Select auth type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="digest">Digest</SelectItem>
                        <SelectItem value="token">Token</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {selected.type === "Sensor" && (
            <AccordionItem value="data-source">
              <AccordionTrigger>Data Source</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <Field label="Device ID">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { deviceId: e.target.value } })}
                      placeholder="e.g. sensor-temp-02"
                      readOnly={isReadOnly}
                      value={String(selected.props.deviceId ?? "")}
                    />
                  </Field>
                  <Field label="Sensor Type">
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => onUpdateItem(selected.id, { props: { sensorType: value } })}
                      value={String(selected.props.sensorType ?? "")}
                    >
                      <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                        <SelectValue placeholder="Select sensor type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="temperature">Temperature</SelectItem>
                        <SelectItem value="humidity">Humidity</SelectItem>
                        <SelectItem value="pressure">Pressure</SelectItem>
                        <SelectItem value="air-quality">Air Quality</SelectItem>
                        <SelectItem value="vibration">Vibration</SelectItem>
                        <SelectItem value="motion">Motion</SelectItem>
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Unit">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { unit: e.target.value } })}
                      placeholder="e.g. °C, %, ppm"
                      readOnly={isReadOnly}
                      value={String(selected.props.unit ?? "")}
                    />
                  </Field>
                  <Field label="Alert Threshold">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { threshold: Number(e.target.value) } })}
                      placeholder="e.g. 50"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.threshold ?? "")}
                    />
                  </Field>
                  <Field label="Host / Broker">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { host: e.target.value } })}
                      placeholder="e.g. mqtt.internal:1883"
                      readOnly={isReadOnly}
                      value={String(selected.props.host ?? "")}
                    />
                  </Field>
                  <Field label="Topic / Path">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { topic: e.target.value } })}
                      placeholder="e.g. /warehouse/sensors/temperature"
                      readOnly={isReadOnly}
                      value={String(selected.props.topic ?? "")}
                    />
                  </Field>
                  <Field label="Poll Interval (s)">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { pollInterval: Number(e.target.value) } })}
                      placeholder="e.g. 30"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.pollInterval ?? "")}
                    />
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {selected.type === "Signal" && (
            <AccordionItem value="data-source">
              <AccordionTrigger>Data Source</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  <Field label="Device ID">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { deviceId: e.target.value } })}
                      placeholder="e.g. gw-delta-03"
                      readOnly={isReadOnly}
                      value={String(selected.props.deviceId ?? "")}
                    />
                  </Field>
                  <Field label="Signal Strength">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { strength: Number(e.target.value) } })}
                      placeholder="0–100 %"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.strength ?? "")}
                    />
                  </Field>
                  <Field label="Frequency (MHz)">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { frequency: Number(e.target.value) } })}
                      placeholder="e.g. 2400"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.frequency ?? "")}
                    />
                  </Field>
                  <Field label="Protocol">
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => onUpdateItem(selected.id, { props: { protocol: value } })}
                      value={String(selected.props.protocol ?? "")}
                    >
                      <SelectTrigger className={isReadOnly ? "pointer-events-none opacity-60" : ""}>
                        <SelectValue placeholder="Select protocol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wifi">Wi-Fi</SelectItem>
                        <SelectItem value="zigbee">Zigbee</SelectItem>
                        <SelectItem value="zwave">Z-Wave</SelectItem>
                        <SelectItem value="lorawan">LoRaWAN</SelectItem>
                        <SelectItem value="bluetooth">Bluetooth</SelectItem>
                        <SelectItem value="cellular">Cellular</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Host">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { host: e.target.value } })}
                      placeholder="e.g. 192.168.1.1"
                      readOnly={isReadOnly}
                      value={String(selected.props.host ?? "")}
                    />
                  </Field>
                  <Field label="Port">
                    <Input
                      className={isReadOnly ? "pointer-events-none opacity-60" : ""}
                      onChange={(e) => onUpdateItem(selected.id, { props: { port: Number(e.target.value) } })}
                      placeholder="e.g. 8080"
                      readOnly={isReadOnly}
                      type="number"
                      value={String(selected.props.port ?? "")}
                    />
                  </Field>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
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
