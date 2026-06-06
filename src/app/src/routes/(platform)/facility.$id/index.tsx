"use client";

import { useHotkeys } from "@tanstack/react-hotkeys";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  EyeIcon,
  Loader2,
  PencilIcon,
  PlayIcon,
  Save,
  SettingsIcon,
  SquareIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/src/components/ui/dialog";
import { Input } from "#/src/components/ui/input";
import { Label } from "#/src/components/ui/label";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "#/src/components/ui/menubar";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/src/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/src/components/ui/tooltip";
import { deleteFacility, loadFacility, saveFacility } from "#/src/lib/functions/facility";
import { type FacilityEventRow, getFacilityEvents } from "#/src/lib/functions/facility-events";
import { clearContainerLogs, getMonitoringStatus, startMonitoring, stopMonitoring } from "#/src/lib/functions/server";
import type { FacilityEvent, MonitoringStatus, ObserverSocketMessage } from "#/src/lib/monitoring/types";
import { CanvasEditor } from "./-components/canvas-editor";
import { ComponentPalette } from "./-components/component-palette";
import { ContainerLogsDialog } from "./-components/container-logs-dialog";
import { DeviceEventPanel } from "./-components/device-event-panel";
import { MonitoringLogsPanel } from "./-components/monitoring-logs-panel";
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
      <Label className="font-medium text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Map a D1 FacilityEventRow to a LogEntry for the UI. */
function d1EventToLogEntry(event: FacilityEventRow, deviceMap: Map<string, PlacedItem>): LogEntry {
  const device = event.deviceId ? deviceMap.get(event.deviceId) : null;
  return {
    id: event.id,
    deviceId: event.deviceId ?? "",
    deviceName: device?.name ?? (event.deviceId ? event.deviceId : "Facility"),
    deviceType: (device?.type ?? "Sensor") as PlacedItemType,
    timestamp: new Date(event.createdAt),
    level: event.severity,
    message: event.message,
  };
}

/**
 * Guess whether a raw DO event is a high-level facility event (persisted to D1)
 * based on its type and parsed severity. If so, refetch D1 facility_events
 * when it arrives via the WebSocket.
 */
function isFacilityEvent(ev: FacilityEvent): boolean {
  if (ev.type === "monitoring:started" || ev.type === "monitoring:stopped") return true;
  if (ev.type === "monitoring:heartbeat" || ev.type === "cctv:frame:ok" || ev.type === "sensor:reading") return false;
  try {
    const parsed = JSON.parse(ev.data);
    if (parsed.level === "warn" || parsed.level === "error") return true;
  } catch {
    // fall through
  }
  return true;
}

/** Human-readable label for a MonitoringStatus value. */
function monitoringStatusLabel(status: MonitoringStatus): string {
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
  const [editMode, setEditMode] = useState<EditMode>("monitoring");
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [facilityName, setFacilityName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Observer WebSocket events (Container Logs only) ────────────────────
  const [observationEvents, setObservationEvents] = useState<FacilityEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // ── D1-backed facility events (Global Events + Device Event History) ─────
  const [facilityEvents, setFacilityEvents] = useState<FacilityEventRow[]>([]);

  // ── Monitoring container status ────────────────────────────────────────
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>("stopped");
  const [isMonitoringChanging, setIsMonitoringChanging] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [containerLogsOpen, setContainerLogsOpen] = useState(false);

  const handleClearContainerLogs = useCallback(async () => {
    try {
      const result = await clearContainerLogs({ data: { facilityId } });
      if (result.success) {
        setObservationEvents([]);
        toast.success("Container logs cleared");
      } else {
        toast.error("Failed to clear container logs");
      }
    } catch {
      toast.error("Failed to clear container logs");
    }
  }, [facilityId]);

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
              setObservationEvents(msg.events);
              break;
            case "event":
              setObservationEvents((prev) => [msg.event, ...prev]);
              // If a high-level event arrived, refetch D1 facility events
              if (isFacilityEvent(msg.event)) {
                getFacilityEvents({ data: { facilityId } })
                  .then((r) => setFacilityEvents(r as unknown as FacilityEventRow[]))
                  .catch(() => {});
              }
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

  // ── Fetch initial facility events from D1 on mount ─────────────────────
  useEffect(() => {
    getFacilityEvents({ data: { facilityId } })
      .then((r) => setFacilityEvents(r as unknown as FacilityEventRow[]))
      .catch(() => {});
  }, [facilityId]);

  // ── Fetch initial monitoring status on mount ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const result = await getMonitoringStatus({ data: { facilityId } });
        setMonitoringStatus(result.status);
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

  // Derive LogEntry[] from D1 facility_events (Global Events + Device Event History)
  const facilityEventLogs = useMemo(() => {
    const deviceMap = new Map(placedItems.map((i) => [i.id, i]));
    return facilityEvents.map((e) => d1EventToLogEntry(e, deviceMap));
  }, [facilityEvents, placedItems]);

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

  // ── Monitoring container controls ────────────────────────────────────────

  const handleStartMonitoring = useCallback(async () => {
    // Validate CCTV devices have required stream config
    const items = placedItemsRef.current;
    const cctvDevices = items.filter((i) => i.type === "CCTV");
    for (const dev of cctvDevices) {
      const source = String(dev.props.videoSource ?? "simulation");
      if (source === "simulation") {
        const stream = String(dev.props.simulationStream ?? "");
        if (!stream) {
          toast.error(`CCTV "${dev.name}": select a simulation stream before starting monitoring`);
          return;
        }
      } else {
        const url = String(dev.props.streamUrl ?? "");
        if (!url) {
          toast.error(`CCTV "${dev.name}": enter a stream URL before starting monitoring`);
          return;
        }
      }
    }

    setIsMonitoringChanging(true);
    try {
      const result = await startMonitoring({ data: { facilityId } });
      setMonitoringStatus(result.status);
      toast.success("Monitoring started");
    } catch {
      toast.error("Failed to start monitoring");
      setMonitoringStatus("error");
    } finally {
      setIsMonitoringChanging(false);
    }
  }, [facilityId]);

  const handleStopMonitoring = useCallback(async () => {
    setIsMonitoringChanging(true);
    try {
      const result = await stopMonitoring({ data: { facilityId } });
      setMonitoringStatus(result.status);
      toast.success("Monitoring stopped");
    } catch {
      toast.error("Failed to stop monitoring");
      setMonitoringStatus("error");
    } finally {
      setIsMonitoringChanging(false);
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
      // Switching from edit → monitoring — save if dirty then switch
      if (isDirty) handleSave({ silent: true });
      setEditMode("monitoring");
      return;
    }

    // Switching from monitoring → edit
    if (monitoringStatus === "running" || monitoringStatus === "starting") {
      setEditConfirmOpen(true);
    } else {
      setEditMode("edit");
    }
  }, [editMode, isDirty, handleSave, monitoringStatus]);

  const handleConfirmEdit = useCallback(async () => {
    setEditConfirmOpen(false);
    setIsMonitoringChanging(true);
    try {
      await stopMonitoring({ data: { facilityId } });
      setMonitoringStatus("stopped");
      setEditMode("edit");
    } catch {
      toast.error("Failed to stop monitoring before editing");
      setMonitoringStatus("error");
    } finally {
      setIsMonitoringChanging(false);
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

        {/* ── Spacer + monitoring toggle + save + mode toggle + settings ── */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Monitoring start / stop button (monitoring mode only) */}
          {editMode === "monitoring" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={
                    isMonitoringChanging
                      ? "Changing…"
                      : monitoringStatus === "running"
                        ? "Stop monitoring"
                        : monitoringStatus === "stopped"
                          ? "Start monitoring"
                          : "Start monitoring"
                  }
                  disabled={isMonitoringChanging || monitoringStatus === "starting" || monitoringStatus === "stopping"}
                  onClick={monitoringStatus === "running" ? handleStopMonitoring : handleStartMonitoring}
                  size="icon-sm"
                  variant="ghost"
                >
                  {isMonitoringChanging || monitoringStatus === "starting" || monitoringStatus === "stopping" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : monitoringStatus === "running" ? (
                    <SquareIcon className="size-4" />
                  ) : (
                    <PlayIcon className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isMonitoringChanging ? "Working…" : monitoringStatus === "running" ? "Stop" : "Start"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Dashboard button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="View analytics"
                onClick={() => navigate({ to: "/analytics/$id", params: { id: facilityId } })}
                size="icon-sm"
                variant="ghost"
              >
                <BarChart3 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Analytics</TooltipContent>
          </Tooltip>

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

          {/* Edit / Monitoring mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={editMode === "monitoring" ? "Switch to Edit mode" : "Switch to Monitoring mode"}
                onClick={handleEditToggle}
                size="icon-sm"
                variant="ghost"
              >
                {editMode === "monitoring" ? <PencilIcon /> : <EyeIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{editMode === "monitoring" ? "Edit" : "Monitor"}</TooltipContent>
          </Tooltip>

          {/* Container Logs button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label="View logs" onClick={() => setContainerLogsOpen(true)} size="icon-sm" variant="ghost">
                <TerminalIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Logs</TooltipContent>
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
                    {deleting ? "Deleting…" : confirmDelete ? "Confirm?" : "Delete"}
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

      {/* ── Confirmation dialog: edit while monitoring is running ── */}
      <Dialog onOpenChange={setEditConfirmOpen} open={editConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop monitoring before editing?</DialogTitle>
            <DialogDescription>
              This facility is currently {monitoringStatusLabel(monitoringStatus)}. You must stop the monitoring before
              editing the facility layout and devices. Do you want to stop the monitoring and switch to edit mode?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEditConfirmOpen(false)} size="sm" variant="outline">
              Cancel
            </Button>
            <Button disabled={isMonitoringChanging} onClick={handleConfirmEdit} size="sm" variant="default">
              {isMonitoringChanging ? (
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

      {/* ── Container Logs Dialog (DO observations only) ── */}
      <ContainerLogsDialog
        events={observationEvents}
        onClearLogs={handleClearContainerLogs}
        onOpenChange={setContainerLogsOpen}
        open={containerLogsOpen}
      />

      {/* ── Resizable Panels ── */}
      <ResizablePanelGroup className="flex-1" orientation="horizontal">
        {/* Left panel — logs (monitoring) / component palette (edit) */}
        <ResizablePanel defaultSize={22} minSize={8}>
          {editMode === "monitoring" ? (
            <MonitoringLogsPanel
              logs={facilityEventLogs}
              onSelectDevice={setSelectedItemId}
              selectedDeviceId={selectedItemId}
            />
          ) : (
            <ComponentPalette />
          )}
        </ResizablePanel>

        <ResizableHandle
          className="w-1.5 transition-colors after:w-2 hover:bg-accent/50 data-[orientation=horizontal]:w-1.5"
          withHandle
        />

        {/* Center panel — Konva canvas (live in monitoring, editable in edit) */}
        <ResizablePanel defaultSize={56} minSize={30}>
          <div className="relative h-full w-full">
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-background">
                <span className="text-muted-foreground/50 text-xs">Loading facility…</span>
              </div>
            ) : (
              <CanvasEditor
                onAddItem={addPlacedItem}
                onSelectItem={setSelectedItemId}
                onUpdateItem={updatePlacedItem}
                placedItems={placedItems}
                readOnly={editMode === "monitoring"}
                selectedItemId={selectedItemId}
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle
          className="w-1.5 transition-colors after:w-2 hover:bg-accent/50 data-[orientation=horizontal]:w-1.5"
          withHandle
        />

        {/* Right panel — properties (edit) / device logs (monitoring) */}
        <ResizablePanel defaultSize={22} minSize={8}>
          {editMode === "monitoring" ? (
            <DeviceEventPanel
              facilityId={facilityId}
              logs={facilityEventLogs}
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
