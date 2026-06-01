"use client";

import { useHotkeys } from "@tanstack/react-hotkeys";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EyeIcon, Loader2, PencilIcon, PlayIcon, Save, SettingsIcon, SquareIcon, TerminalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/components/ui/resizable.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip.tsx";
import { deleteFacility, loadFacility, saveFacility } from "#/lib/functions/facility";
import { getMonitorStatus, startMonitor, stopMonitor } from "#/lib/functions/monitor";
import type { FacilityEvent, MonitorStatus, ObserverSocketMessage } from "#/lib/monitoring/types";
import { CanvasEditor } from "./-components/canvas-editor";
import { ComponentPalette } from "./-components/component-palette";
import { ContainerLogsDialog } from "./-components/container-logs-dialog";
import { DeviceEventPanel } from "./-components/device-event-panel";
import { MonitorLogsPanel } from "./-components/monitor-logs-panel";
import { PropertiesPanel } from "./-components/properties-panel";
import type { EditMode, LogEntry, PlacedItem, PlacedItemType } from "./-helpers/types";
import {
  DEFAULT_PROPS,
  DEFAULT_SIZES,
  fromSnapshot,
  toCanvasData,
  toDevicePayloads,
  toZonePayloads,
} from "./-helpers/types";

export const Route = createFileRoute("/(platform)/facility/$id/")({
  component: Page,
});

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

/** Map a raw FacilityEvent (from the Observer DO) to a LogEntry for the UI. */
function eventToLogEntry(event: FacilityEvent, deviceMap: Map<string, PlacedItem>): LogEntry {
  let level: LogEntry["level"] = "info";
  let message = event.type;

  try {
    const parsed = JSON.parse(event.data);
    if (typeof parsed.level === "string" && ["info", "warn", "error"].includes(parsed.level)) {
      level = parsed.level as LogEntry["level"];
    }
    if (typeof parsed.message === "string") {
      message = parsed.message;
    }
  } catch {
    // data is not JSON — use the raw string
    if (event.data && event.data !== "{}") {
      message = event.data;
    }
  }

  const device = deviceMap.get(event.deviceId);

  return {
    id: event.id,
    deviceId: event.deviceId,
    deviceName: device?.name ?? event.deviceId,
    deviceType: device?.type ?? "Sensor",
    timestamp: new Date(event.createdAt),
    level,
    message,
  };
}

/** Human-readable label for a MonitorStatus value. */
function monitorStatusLabel(status: MonitorStatus): string {
  switch (status) {
    case "running":
      return "Running";
    case "starting":
      return "Starting…";
    case "stopping":
      return "Stopping…";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
  }
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

  // ── Observer WebSocket events ──────────────────────────────────────────
  const [events, setEvents] = useState<FacilityEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // ── Monitor container status ───────────────────────────────────────────
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>("stopped");
  const [isMonitorChanging, setIsMonitorChanging] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [containerLogsOpen, setContainerLogsOpen] = useState(false);

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

  // ── Connect to the Observer DO via WebSocket ──────────────────────────
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/facility/${facilityId}/observer/ws`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isDestroyed = false;

    function connect() {
      if (isDestroyed) return;
      ws = new WebSocket(wsUrl);

      ws.addEventListener("open", () => {
        if (isDestroyed) return ws?.close();
      });

      ws.addEventListener("message", (event: MessageEvent) => {
        if (isDestroyed) return;
        try {
          const msg: ObserverSocketMessage = JSON.parse(event.data);
          switch (msg.type) {
            case "snapshot":
              setEvents(msg.events);
              break;
            case "event":
              setEvents((prev) => [msg.event, ...prev]);
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.addEventListener("close", () => {
        ws = null;
        if (!isDestroyed) {
          // Reconnect after 3 seconds
          reconnectTimer = setTimeout(connect, 3000);
        }
      });

      ws.addEventListener("error", () => {
        // close event will fire after error, triggering reconnect
      });
    }

    connect();

    return () => {
      isDestroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [facilityId]);

  // ── Fetch initial monitor status on mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const result = await getMonitorStatus({ data: { facilityId } });
        setMonitorStatus(result.status);
      } catch {
        // Non-critical; default to stopped
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

  // Derive LogEntry[] from raw Observer events, enriched with device names
  const logs = useMemo(() => {
    const deviceMap = new Map(placedItems.map((i) => [i.id, i]));
    return events.map((e) => eventToLogEntry(e, deviceMap));
  }, [events, placedItems]);

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

  // ── Monitor container controls ───────────────────────────────────────────

  const handleStartMonitor = useCallback(async () => {
    setIsMonitorChanging(true);
    try {
      const result = await startMonitor({ data: { facilityId } });
      setMonitorStatus(result.status);
      toast.success("Monitor started");
    } catch {
      toast.error("Failed to start monitor");
      setMonitorStatus("error");
    } finally {
      setIsMonitorChanging(false);
    }
  }, [facilityId]);

  const handleStopMonitor = useCallback(async () => {
    setIsMonitorChanging(true);
    try {
      const result = await stopMonitor({ data: { facilityId } });
      setMonitorStatus(result.status);
      toast.success("Monitor stopped");
    } catch {
      toast.error("Failed to stop monitor");
      setMonitorStatus("error");
    } finally {
      setIsMonitorChanging(false);
    }
  }, [facilityId]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async ({ silent = false } = {}) => {
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
    },
    [facilityId, facilityName],
  );

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

  // ── Edit mode guard ──────────────────────────────────────────────────────

  const handleEditToggle = useCallback(() => {
    if (editMode === "edit") {
      // Switching from edit → monitor — save if dirty then switch
      if (isDirty) handleSave({ silent: true });
      setEditMode("monitor");
      return;
    }

    // Switching from monitor → edit
    if (monitorStatus === "running" || monitorStatus === "starting") {
      setEditConfirmOpen(true);
    } else {
      setEditMode("edit");
    }
  }, [editMode, isDirty, handleSave, monitorStatus]);

  const handleConfirmEdit = useCallback(async () => {
    setEditConfirmOpen(false);
    setIsMonitorChanging(true);
    try {
      await stopMonitor({ data: { facilityId } });
      setMonitorStatus("stopped");
      setEditMode("edit");
    } catch {
      toast.error("Failed to stop monitor before editing");
      setMonitorStatus("error");
    } finally {
      setIsMonitorChanging(false);
    }
  }, [facilityId]);

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

        {/* ── Spacer + monitor toggle + save + mode toggle + settings ── */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Monitor start / stop button (monitor mode only) */}
          {editMode === "monitor" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={
                    isMonitorChanging
                      ? "Changing…"
                      : monitorStatus === "running"
                        ? "Stop monitor"
                        : monitorStatus === "stopped"
                          ? "Start monitor"
                          : "Start monitor"
                  }
                  disabled={isMonitorChanging || monitorStatus === "starting" || monitorStatus === "stopping"}
                  onClick={monitorStatus === "running" ? handleStopMonitor : handleStartMonitor}
                  size="icon-sm"
                  variant="ghost"
                >
                  {isMonitorChanging || monitorStatus === "starting" || monitorStatus === "stopping" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : monitorStatus === "running" ? (
                    <SquareIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isMonitorChanging ? "Working…" : monitorStatus === "running" ? "Stop monitor" : "Start monitor"}
              </TooltipContent>
            </Tooltip>
          )}

          {editMode === "edit" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={isSaving ? "Saving…" : "Save facility"}
                  className="relative"
                  disabled={isSaving}
                  onClick={() => handleSave()}
                  size="icon-sm"
                  variant="ghost"
                >
                  {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {isDirty && !isSaving && (
                    <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save</TooltipContent>
            </Tooltip>
          )}

          {/* Edit / Monitor mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={editMode === "monitor" ? "Switch to Edit mode" : "Switch to Monitor mode"}
                onClick={handleEditToggle}
                size="icon-sm"
                variant="ghost"
              >
                {editMode === "monitor" ? <PencilIcon /> : <EyeIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{editMode === "monitor" ? "Edit mode" : "Monitor mode"}</TooltipContent>
          </Tooltip>

          {/* Container Logs button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="View container logs"
                onClick={() => setContainerLogsOpen(true)}
                size="icon-sm"
                variant="ghost"
              >
                <TerminalIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Container Logs</TooltipContent>
          </Tooltip>

          <Dialog
            onOpenChange={(open) => {
              setSettingsOpen(open);
              setConfirmDelete(false);
              if (open) setSettingsName(facilityName);
            }}
            open={settingsOpen}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button aria-label="Settings" size="icon-sm" variant="ghost">
                    <SettingsIcon />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>
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

      {/* ── Confirmation dialog: edit while monitor is running ── */}
      <Dialog onOpenChange={setEditConfirmOpen} open={editConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop monitor before editing?</DialogTitle>
            <DialogDescription>
              This facility is currently {monitorStatusLabel(monitorStatus)}. You must stop the monitor before editing
              the facility layout and devices. Do you want to stop the monitor and switch to edit mode?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEditConfirmOpen(false)} size="sm" variant="outline">
              Cancel
            </Button>
            <Button disabled={isMonitorChanging} onClick={handleConfirmEdit} size="sm" variant="default">
              {isMonitorChanging ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Stopping…
                </>
              ) : (
                "Stop and edit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Container Logs Dialog ── */}
      <ContainerLogsDialog events={events} onOpenChange={setContainerLogsOpen} open={containerLogsOpen} />

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
            <DeviceEventPanel
              logs={logs}
              selectedDevice={placedItems.find((i) => i.id === selectedItemId) ?? null}
              selectedDeviceId={selectedItemId}
            />
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
