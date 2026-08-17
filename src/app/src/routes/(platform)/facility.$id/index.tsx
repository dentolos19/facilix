"use client";

import { useHotkeys } from "@tanstack/react-hotkeys";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BarChart3,
  CopyIcon,
  CuboidIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileJsonIcon,
  ImagePlusIcon,
  Loader2,
  MessageCircleIcon,
  PencilIcon,
  PlayIcon,
  Redo2Icon,
  Save,
  SettingsIcon,
  SquareIcon,
  TerminalIcon,
  Trash2Icon,
  Undo2Icon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ChatAssistant } from "#/components/chat-assistant";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "#/components/ui/menubar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "#/components/ui/resizable";
import { Separator } from "#/components/ui/separator";
import { Switch } from "#/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import {
  type FacilityEventRow,
  type FacilityEventView,
  getAllFacilityEvents,
  getFacilityEvents,
} from "#/lib/functions/events";
import { deleteFacility, duplicateFacility, loadFacility, saveFacility } from "#/lib/functions/facility";
import {
  type FacilityMemberRow,
  addFacilityMember,
  getFacilityMembers,
  removeFacilityMember,
} from "#/lib/functions/facility-members";
import { getFacilitySettings, saveFacilitySettings } from "#/lib/functions/facility-settings";
import { clearContainerLogs, getMonitoringStatus, startMonitoring, stopMonitoring } from "#/lib/functions/server";
import { createFacilityLayoutDocument, type FacilityLayoutDocument } from "#/lib/layouts";
import { type FacilitySettings, logTypesByCategory } from "#/lib/monitoring/logs";
import { selectedDeviceId, type MonitoringSelection } from "#/lib/monitoring/selection";
import type { MonitoringStatus, ObserverSocketMessage } from "#/lib/monitoring/types";
import { fetchSimulationStreams } from "#/lib/simulation/cctv";
import { fetchSimulationSensors } from "#/lib/simulation/sensors";

import { AllEventsDialog } from "./-components/all-events-dialog";
import { CanvasEditor } from "./-components/canvas-editor";
import { ComponentPalette } from "./-components/component-palette";
import { GlobalEventsPanel } from "./-components/global-events-panel";
import { MonitoringDetailsPanel } from "./-components/monitoring-details-panel";
import { PropertiesPanel } from "./-components/properties-panel";

const Facility3DView = lazy(() =>
  import("./-components/facility-3d-view").then((m) => ({ default: m.Facility3DView })),
);

import { FacilityHoverCard } from "./-components/facility-hover-card";
import type { EditMode, JsonObject, PlacedItem, PlacedItemType } from "./-helpers/types";
import {
  DEFAULT_PROPS,
  DEFAULT_SIZES,
  fromSnapshot,
  recomputeZoneLinks,
  toCanvasData,
  toDevicePayloads,
  toZonePayloads,
} from "./-helpers/types";

export const Route = createFileRoute("/(platform)/facility/$id/")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): { mode?: "edit"; view?: "2d" | "3d" } => ({
    ...(search.mode === "edit" ? { mode: "edit" as const } : {}),
    ...(search.view === "3d" ? { view: "3d" as const } : {}),
  }),
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
      <Label className="text-muted-foreground text-[11px] font-medium">{label}</Label>
      {children}
    </div>
  );
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
  const navigate = Route.useNavigate();
  const { id: facilityId } = Route.useParams();
  const { mode, view } = Route.useSearch();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const editMode: EditMode = mode === "edit" ? "edit" : "monitoring";
  const setEditMode = useCallback(
    (value: EditMode) => {
      navigate({
        search: { mode: value === "edit" ? "edit" : undefined, view: value === "edit" ? undefined : view },
        replace: true,
      });
    },
    [navigate, view],
  );
  const layoutView = view ?? "2d";
  const setLayoutView = useCallback(
    (value: "2d" | "3d") => {
      navigate({
        search: { mode: mode === "edit" ? "edit" : undefined, view: value === "3d" ? "3d" : undefined },
        replace: true,
      });
    },
    [navigate, mode],
  );
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [facilityName, setFacilityName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsTab, setSettingsTab] = useState<"general" | "events" | "members">("general");
  const [settings, setSettings] = useState<FacilitySettings>({ globalEvents: { enabledLogTypes: [] } });
  const [members, setMembers] = useState<FacilityMemberRow[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  // ── D1-backed facility events (filtered by settings for global events panel) ─────
  const [facilityEvents, setFacilityEvents] = useState<FacilityEventRow[]>([]);

  // ── D1-backed ALL events (unfiltered, for logs dialog) ─────
  const [allEvents, setAllEvents] = useState<FacilityEventRow[]>([]);

  // ── Monitoring container status ────────────────────────────────────────
  const [monitoringStatus, setMonitoringStatus] = useState<MonitoringStatus>("stopped");
  const [isMonitoringChanging, setIsMonitoringChanging] = useState(false);
  const monitoringActionInFlightRef = useRef<number | null>(null);
  const monitoringRequestVersionRef = useRef(0);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpandedOpen, setChatExpandedOpen] = useState(false);

  const handleClearContainerLogs = useCallback(async () => {
    try {
      const result = await clearContainerLogs({ data: { facilityId } });
      if (result.success) {
        setFacilityEvents([]);
        setAllEvents([]);
        setMonitoringSelection(null);
        toast.success("Events cleared");
      } else {
        toast.error("Failed to clear events");
      }
    } catch {
      toast.error("Failed to clear events");
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
        const [snapshot, settingsRow] = await Promise.all([
          loadFacility({ data: { id: facilityId } }),
          getFacilitySettings({ data: { facilityId } }),
        ]);
        setFacilityName(snapshot.name);
        setSettingsName(snapshot.name);
        setSettings(settingsRow.settings);
        const items = fromSnapshot(snapshot.canvasData, snapshot.zones, snapshot.devices);
        setPlacedItems(recomputeZoneLinks(items));
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
            case "event":
              // Refetch both filtered and unfiltered events from D1
              getFacilityEvents({ data: { facilityId } })
                .then((r) => setFacilityEvents(r as unknown as FacilityEventRow[]))
                .catch(() => {});
              getAllFacilityEvents({ data: { facilityId } })
                .then((r) => setAllEvents(r as unknown as FacilityEventRow[]))
                .catch(() => {});
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
    };
  }, [facilityId]);

  // ── Fetch initial facility events from D1 on mount ─────────────────────
  useEffect(() => {
    getFacilityEvents({ data: { facilityId } })
      .then((r) => setFacilityEvents(r as unknown as FacilityEventRow[]))
      .catch(() => {});
    getAllFacilityEvents({ data: { facilityId } })
      .then((r) => setAllEvents(r as unknown as FacilityEventRow[]))
      .catch(() => {});
  }, [facilityId]);

  // ── Fetch initial monitoring status on mount ───────────────────────────
  useEffect(() => {
    const requestVersion = ++monitoringRequestVersionRef.current;
    monitoringActionInFlightRef.current = null;
    setIsMonitoringChanging(false);
    let canceled = false;

    (async () => {
      try {
        const result = await getMonitoringStatus({ data: { facilityId } });
        if (!canceled && requestVersion === monitoringRequestVersionRef.current) {
          setMonitoringStatus(result.status);
        }
      } catch {
        // Non-critical; default to stopped
      }
    })();

    return () => {
      canceled = true;
    };
  }, [facilityId]);

  // Keep externally observed start/stop transitions moving toward a terminal state.
  useEffect(() => {
    if (isMonitoringChanging || (monitoringStatus !== "starting" && monitoringStatus !== "stopping")) return;

    const requestVersion = monitoringRequestVersionRef.current;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refreshStatus = async () => {
      try {
        const result = await getMonitoringStatus({ data: { facilityId } });
        if (canceled || requestVersion !== monitoringRequestVersionRef.current) return;

        setMonitoringStatus(result.status);
        if (result.status === "starting" || result.status === "stopping") {
          timer = setTimeout(refreshStatus, 500);
        }
      } catch {
        if (!canceled) timer = setTimeout(refreshStatus, 1_000);
      }
    };

    timer = setTimeout(refreshStatus, 500);
    return () => {
      canceled = true;
      if (timer) clearTimeout(timer);
    };
  }, [facilityId, isMonitoringChanging, monitoringStatus]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const addPlacedItem = useCallback((type: PlacedItemType, x: number, y: number) => {
    saveSnapshot();
    const id = crypto.randomUUID();
    const size = DEFAULT_SIZES[type];

    const defaultProps = { ...DEFAULT_PROPS[type] };

    setPlacedItems((prev) =>
      recomputeZoneLinks([
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
          status: "unknown",
          notes: "",
          props: defaultProps,
        },
      ]),
    );
    setIsDirty(true);

    // Fire-and-forget: auto-select first available simulation source.
    if (type === "CCTV") {
      fetchSimulationStreams().then((streams) => {
        if (streams.length > 0) {
          setPlacedItems((prev) =>
            recomputeZoneLinks(
              prev.map((item) =>
                item.id === id && !item.props.simulationStream
                  ? { ...item, props: { ...item.props, simulationStream: streams[0].name } }
                  : item,
              ),
            ),
          );
        }
      });
    }
    if (type === "Sensor") {
      fetchSimulationSensors().then((devices) => {
        if (devices.length > 0) {
          setPlacedItems((prev) =>
            recomputeZoneLinks(
              prev.map((item) =>
                item.id === id && !item.props.simulationDeviceId
                  ? {
                      ...item,
                      props: {
                        ...item.props,
                        simulationDeviceId: devices[0].deviceId,
                        sensorType: devices[0].sensorType,
                      },
                    }
                  : item,
              ),
            ),
          );
        }
      });
    }
  }, []);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [monitoringSelection, setMonitoringSelection] = useState<MonitoringSelection>(null);

  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const handleHoverItem = useCallback((id: string | null) => {
    setHoveredItemId(id);
  }, []);

  const handleHoverMove = useCallback((x: number, y: number) => {
    setHoverPos({ x, y });
  }, []);

  // Resolve persisted events against the current facility map without dropping
  // structured event data or evidence attachments.
  const facilityEventViews = useMemo<FacilityEventView[]>(() => {
    const deviceMap = new Map(placedItems.map((i) => [i.id, i]));
    const zoneMap = new Map(placedItems.filter((item) => item.type === "Zone").map((zone) => [zone.id, zone.name]));
    return facilityEvents.map((event) => {
      const device = event.deviceId ? deviceMap.get(event.deviceId) : null;
      return {
        ...event,
        deviceName: device?.name ?? (event.deviceId || "Facility"),
        deviceType: device?.type ?? "Facility",
        zoneName: device?.zoneId ? zoneMap.get(device.zoneId) : undefined,
      };
    });
  }, [facilityEvents, placedItems]);

  const monitoringDeviceId = selectedDeviceId(monitoringSelection);

  const selectMonitoringEvent = useCallback((eventId: string) => {
    setMonitoringSelection({ kind: "event", eventId });
    setSelectedItemId(null);
  }, []);

  const selectMonitoringDevice = useCallback((deviceId: string) => {
    const item = placedItemsRef.current.find((i) => i.id === deviceId);
    if (item?.type === "Zone") {
      setMonitoringSelection({ kind: "zone", zoneId: deviceId });
    } else {
      setMonitoringSelection({ kind: "device", deviceId });
    }
    setSelectedItemId(deviceId);
  }, []);

  const updatePlacedItem = useCallback(
    (id: string, patch: Partial<Pick<PlacedItem, "x" | "y" | "width" | "height">>) => {
      saveSnapshot();
      setPlacedItems((prev) => recomputeZoneLinks(prev.map((item) => (item.id === id ? { ...item, ...patch } : item))));
      setIsDirty(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const updatePlacedItemData = useCallback(
    (id: string, data: Partial<Pick<PlacedItem, "name" | "notes"> & { props: JsonObject }>) => {
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
    setPlacedItems((prev) => recomputeZoneLinks(prev.filter((item) => item.id !== id)));
    setSelectedItemId((prev) => (prev === id ? null : prev));
    setMonitoringSelection((selection) =>
      selection?.kind === "device" && selection.deviceId === id ? null : selection,
    );
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    saveSnapshot();
    const idSet = new Set(ids);
    setPlacedItems((prev) => recomputeZoneLinks(prev.filter((item) => !idSet.has(item.id))));
    setSelectedItemId((prev) => (prev && idSet.has(prev) ? null : prev));
    setMonitoringSelection((selection) =>
      selection?.kind === "device" && idSet.has(selection.deviceId) ? null : selection,
    );
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveItemUp = useCallback((id: string) => {
    saveSnapshot();
    setPlacedItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return recomputeZoneLinks(next);
    });
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveItemDown = useCallback((id: string) => {
    saveSnapshot();
    setPlacedItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return recomputeZoneLinks(next);
    });
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveItemToFront = useCallback((id: string) => {
    saveSnapshot();
    setPlacedItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const item = prev[idx];
      const next = [...prev];
      next.splice(idx, 1);
      next.push(item);
      return recomputeZoneLinks(next);
    });
    setIsDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moveItemToBack = useCallback((id: string) => {
    saveSnapshot();
    setPlacedItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx <= 0) return prev;
      const item = prev[idx];
      const next = [...prev];
      next.splice(idx, 1);
      next.unshift(item);
      return recomputeZoneLinks(next);
    });
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

  const runMonitoringAction = useCallback(
    async (action: "start" | "stop") => {
      if (monitoringActionInFlightRef.current !== null) return false;

      const requestVersion = ++monitoringRequestVersionRef.current;
      monitoringActionInFlightRef.current = requestVersion;
      const targetStatus: MonitoringStatus = action === "start" ? "running" : "stopped";
      setMonitoringStatus(action === "start" ? "starting" : "stopping");
      setIsMonitoringChanging(true);

      let confirmedStatus: MonitoringStatus = "error";
      try {
        const result =
          action === "start"
            ? await startMonitoring({ data: { facilityId } })
            : await stopMonitoring({ data: { facilityId } });
        confirmedStatus = result.status;
      } catch {
        try {
          const result = await getMonitoringStatus({ data: { facilityId } });
          confirmedStatus = result.status;
        } catch {
          confirmedStatus = "error";
        }
      } finally {
        if (monitoringActionInFlightRef.current === requestVersion) {
          monitoringActionInFlightRef.current = null;
        }
        if (requestVersion === monitoringRequestVersionRef.current) {
          setMonitoringStatus(confirmedStatus);
          setIsMonitoringChanging(false);
        }
      }

      if (requestVersion !== monitoringRequestVersionRef.current) return false;

      if (confirmedStatus === targetStatus) {
        toast.success(action === "start" ? "Monitoring started" : "Monitoring stopped");
        return true;
      }

      toast.error(action === "start" ? "Failed to start monitoring" : "Failed to stop monitoring");
      return false;
    },
    [facilityId],
  );

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

    await runMonitoringAction("start");
  }, [runMonitoringAction]);

  const handleStopMonitoring = useCallback(async () => {
    await runMonitoringAction("stop");
  }, [runMonitoringAction]);

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

  const handleExport = useCallback(() => {
    const canvasRect = canvasAreaRef.current?.getBoundingClientRect();
    const document = createFacilityLayoutDocument(facilityName, placedItemsRef.current, {
      width: canvasRect?.width ?? 0,
      height: canvasRect?.height ?? 0,
    });
    const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    const safeName = facilityName
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    link.href = url;
    link.download = `${safeName || "facility"}-layout.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Facility layout exported");
  }, [facilityName]);

  const handleImportClick = useCallback(() => {
    if (editMode !== "edit") {
      toast.info("Switch to Edit mode before importing a facility layout.");
      return;
    }
    fileInputRef.current?.click();
  }, [editMode]);

  const handleDuplicate = useCallback(async () => {
    setIsDuplicating(true);
    try {
      const result = await duplicateFacility({ data: { id: facilityId } });
      toast.success(`Duplicated as "${result.name}"`);
      navigate({ to: "/facility/$id", params: { id: result.id }, search: { mode: "edit" } });
    } catch (err) {
      toast.error("Failed to duplicate facility");
      console.error(err);
    } finally {
      setIsDuplicating(false);
    }
  }, [facilityId, navigate]);

  const processImport = useCallback(async (file: File) => {
    const isJson = file.type === "application/json" || file.name.endsWith(".json");

    if (!isJson) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast.error("Choose an image (JPEG, PNG, WebP) or a JSON file.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error("The image must be smaller than 8 MB.");
        return;
      }
    }

    setIsImporting(true);
    try {
      if (isJson) {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || !("items" in (parsed as Record<string, unknown>))) {
          throw new Error("The JSON file does not contain a valid facility layout.");
        }
        saveSnapshot();
        setPlacedItems((parsed as FacilityLayoutDocument).items);
        setSelectedItemId(null);
        setMonitoringSelection(null);
        setIsDirty(true);
        toast.success(`Imported layout with ${(parsed as FacilityLayoutDocument).items.length} items.`, {
          description: "Review the result. You can use Undo to restore the previous layout.",
        });
      } else {
        const canvasRect = canvasAreaRef.current?.getBoundingClientRect();
        const formData = new FormData();
        formData.append("image", file);
        formData.append("canvasWidth", String(Math.round(canvasRect?.width ?? 1000)));
        formData.append("canvasHeight", String(Math.round(canvasRect?.height ?? 700)));

        const response = await fetch("/api/layouts", { method: "POST", body: formData });
        const payload = (await response.json().catch(() => null)) as
          | (FacilityLayoutDocument & { error?: never })
          | { error?: string }
          | null;
        if (!response.ok || !payload || !("items" in payload)) {
          throw new Error(payload?.error || "Failed to generate the facility layout.");
        }

        saveSnapshot();
        setPlacedItems(payload.items);
        setSelectedItemId(null);
        setMonitoringSelection(null);
        setIsDirty(true);
        toast.success(`Built a layout with ${payload.items.length} items.`, {
          description: "Review the result. You can use Undo to restore the previous layout.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to import the facility layout.");
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleImportFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      if (placedItemsRef.current.length > 0) {
        setPendingImportFile(file);
        setImportConfirmOpen(true);
        return;
      }

      void processImport(file);
    },
    [processImport],
  );

  const handleConfirmImport = useCallback(() => {
    setImportConfirmOpen(false);
    if (pendingImportFile) {
      const file = pendingImportFile;
      setPendingImportFile(null);
      void processImport(file);
    }
  }, [pendingImportFile, processImport]);

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
      await Promise.all([
        saveFacility({
          data: { facilityId, name: settingsName.trim(), canvasData, zones, devices },
        }),
        saveFacilitySettings({ data: { facilityId, settings } }),
      ]);
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
  }, [facilityId, settingsName, settings]);

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

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const result = await getFacilityMembers({ data: { facilityId } });
      setMembers(result);
    } catch {
      toast.error("Failed to load members");
    } finally {
      setMembersLoading(false);
    }
  }, [facilityId]);

  const handleAddMember = useCallback(async () => {
    if (!memberEmail.trim()) return;
    setIsAddingMember(true);
    try {
      await addFacilityMember({ data: { facilityId, email: memberEmail.trim() } });
      setMemberEmail("");
      toast.success("Member added");
      void fetchMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add member";
      toast.error(message);
    } finally {
      setIsAddingMember(false);
    }
  }, [facilityId, memberEmail, fetchMembers]);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      try {
        await removeFacilityMember({ data: { facilityId, userId } });
        toast.success("Member removed");
        void fetchMembers();
      } catch {
        toast.error("Failed to remove member");
      }
    },
    [facilityId, fetchMembers],
  );

  // ── Edit mode guard ──────────────────────────────────────────────────────

  const handleEditToggle = useCallback(() => {
    if (editMode === "edit") {
      // Switching from edit → monitoring — save if dirty then switch
      if (isDirty) handleSave({ silent: true });
      setMonitoringSelection(selectedItemId ? { kind: "device", deviceId: selectedItemId } : null);
      setEditMode("monitoring");
      return;
    }

    // Switching from monitoring → edit
    if (monitoringStatus === "running" || monitoringStatus === "starting") {
      setEditConfirmOpen(true);
    } else {
      setSelectedItemId(monitoringDeviceId);
      setEditMode("edit");
    }
  }, [editMode, isDirty, handleSave, monitoringStatus, monitoringDeviceId, selectedItemId, setEditMode]);

  const handleConfirmEdit = useCallback(async () => {
    setEditConfirmOpen(false);
    if (!(await runMonitoringAction("stop"))) return;

    setSelectedItemId(monitoringDeviceId);
    setEditMode("edit");
  }, [monitoringDeviceId, runMonitoringAction, setEditMode]);

  // ── Keyboard shortcuts (edit mode only) ─────────────────────────────────
  useHotkeys([
    { hotkey: "Mod+Z", callback: () => handleUndo(), options: { enabled: editMode === "edit" && canUndo } },
    { hotkey: "Mod+Y", callback: () => handleRedo(), options: { enabled: editMode === "edit" && canRedo } },
    { hotkey: "Mod+S", callback: () => handleSave(), options: { enabled: editMode === "edit" } },
  ]);

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden">
      {/* ── Menubar ── */}
      <input
        accept="image/jpeg,image/png,image/webp,.json"
        className="hidden"
        onChange={handleImportFileSelected}
        ref={fileInputRef}
        type="file"
      />
      <Menubar className="shrink-0 rounded-none border-x-0 border-t-0">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            {editMode === "edit" && (
              <>
                <MenubarItem disabled={isSaving} onClick={() => handleSave()}>
                  <Save className="mr-2 size-4" />
                  Save{isDirty ? " *" : ""} <MenubarShortcut>⌘S</MenubarShortcut>
                </MenubarItem>
                <MenubarItem disabled={isDuplicating} onClick={handleDuplicate}>
                  <CopyIcon className="mr-2 size-4" />
                  {isDuplicating ? "Duplicating…" : "Duplicate"}
                </MenubarItem>
                <MenubarSeparator />
              </>
            )}
            {editMode !== "edit" && (
              <MenubarItem disabled={isDuplicating} onClick={handleDuplicate}>
                <CopyIcon className="mr-2 size-4" />
                {isDuplicating ? "Duplicating…" : "Duplicate"}
              </MenubarItem>
            )}
            {editMode === "edit" && (
              <MenubarItem disabled={isImporting} onClick={handleImportClick}>
                {isImporting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <ImagePlusIcon className="mr-2 size-4" />
                )}
                {isImporting ? "Importing…" : "Import"}
              </MenubarItem>
            )}
            <MenubarItem onClick={handleExport}>
              <DownloadIcon className="mr-2 size-4" />
              Export
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              onClick={() => {
                if (isDirty) handleSave({ silent: true });
                navigate({ to: "/dashboard" });
              }}
              variant="destructive"
            >
              <ArrowLeftIcon className="mr-2 size-4" />
              Back to Dashboard
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {editMode === "edit" && (
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled={!canUndo} onClick={handleUndo}>
                <Undo2Icon className="mr-2 size-4" />
                Undo <MenubarShortcut>⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled={!canRedo} onClick={handleRedo}>
                <Redo2Icon className="mr-2 size-4" />
                Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                <Trash2Icon className="mr-2 size-4" />
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

          {/* Manage button (monitoring mode only) */}
          {editMode === "monitoring" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Manage facility"
                  onClick={() => navigate({ to: "/manage/$id", params: { id: facilityId } })}
                  size="icon-sm"
                  variant="ghost"
                >
                  <BarChart3 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Manage</TooltipContent>
            </Tooltip>
          )}

          {/* 2D / 3D view toggle (monitoring mode only) */}
          {editMode === "monitoring" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={layoutView === "3d" ? "Switch to 2D view" : "Switch to 3D view"}
                  onClick={() => setLayoutView(layoutView === "3d" ? "2d" : "3d")}
                  size="icon-sm"
                  variant={layoutView === "3d" ? "secondary" : "ghost"}
                >
                  <CuboidIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{layoutView === "3d" ? "2D" : "3D"}</TooltipContent>
            </Tooltip>
          )}

          {/* Facility chat button (monitoring mode only) */}
          {editMode === "monitoring" && (
            <Popover onOpenChange={setChatOpen} open={chatOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button aria-label="Open chat assistant" size="icon-sm" variant="ghost">
                      <MessageCircleIcon />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Chat</TooltipContent>
              </Tooltip>
              <PopoverContent
                align="end"
                className="h-[min(38rem,calc(100vh-5rem))] w-[min(28rem,calc(100vw-2rem))] overflow-hidden p-0 data-[state=closed]:hidden"
                forceMount
                sideOffset={8}
              >
                <ChatAssistant
                  facilityId={facilityId}
                  onClose={() => setChatOpen(false)}
                  onExpand={() => {
                    setChatOpen(false);
                    setChatExpandedOpen(true);
                  }}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Expanded chat dialog */}
          <Dialog onOpenChange={setChatExpandedOpen} open={chatExpandedOpen}>
            <DialogContent
              className="flex flex-col gap-0 overflow-hidden p-0"
              showCloseButton={false}
              style={{ height: "90vh", width: "calc(100vw - 2rem)", maxWidth: "64rem" }}
            >
              <header className="border-border flex h-12 shrink-0 items-center gap-3 border-b px-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-medium">Chat</h2>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Open in Manage"
                      onClick={() =>
                        navigate({ to: "/manage/$id", params: { id: facilityId }, search: { tab: "chat" } })
                      }
                      size="icon-sm"
                      variant="ghost"
                    >
                      <ExternalLinkIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in Manage</TooltipContent>
                </Tooltip>
                <Button
                  aria-label="Close expanded chat"
                  onClick={() => setChatExpandedOpen(false)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </header>
              <ChatAssistant facilityId={facilityId} hideHeader />
            </DialogContent>
          </Dialog>

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

          {/* Container Logs button (monitoring mode only) */}
          {editMode === "monitoring" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="View logs" onClick={() => setLogsOpen(true)} size="icon-sm" variant="ghost">
                  <TerminalIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Logs</TooltipContent>
            </Tooltip>
          )}

          <Dialog
            onOpenChange={(open) => {
              setSettingsOpen(open);
              setConfirmDelete(false);
              setSettingsTab("general");
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
            <DialogContent className="max-h-[80vh] w-full max-w-lg overflow-y-auto p-0 sm:max-w-xl">
              <DialogHeader className="p-4 pb-0">
                <DialogTitle>Facility Settings</DialogTitle>
                <DialogDescription>Edit facility metadata and preferences.</DialogDescription>
              </DialogHeader>
              <div className="border-border flex border-b">
                {[
                  { id: "general", label: "General" },
                  { id: "events", label: "Events" },
                  { id: "members", label: "Members" },
                ].map((tab) => (
                  <button
                    className={`relative flex-1 px-4 py-3 text-center text-sm font-medium transition-colors ${
                      settingsTab === tab.id
                        ? "border-primary text-foreground border-b-2"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    key={tab.id}
                    onClick={() => {
                      setSettingsTab(tab.id as "general" | "events" | "members");
                      if (tab.id === "members") fetchMembers();
                    }}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {settingsTab === "members" ? (
                <div className="flex flex-col gap-4 p-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="text-xs" htmlFor="member-email">
                        Add member by email
                      </Label>
                      <Input
                        disabled={isAddingMember}
                        id="member-email"
                        onChange={(e) => setMemberEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddMember();
                        }}
                        placeholder="user@example.com"
                        value={memberEmail}
                      />
                    </div>
                    <Button disabled={!memberEmail.trim() || isAddingMember} onClick={handleAddMember} size="sm">
                      {isAddingMember ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UserPlusIcon className="size-4" />
                      )}
                      Add
                    </Button>
                  </div>
                  <Separator />
                  {membersLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="text-muted-foreground size-5 animate-spin" />
                    </div>
                  ) : members.length === 0 ? (
                    <p className="text-muted-foreground py-2 text-center text-xs">No members yet</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {members.map((member) => (
                        <div
                          className="hover:bg-muted/50 flex items-center justify-between rounded-md px-2 py-1.5"
                          key={member.userId}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">{member.userName}</span>
                            <span className="text-muted-foreground truncate text-[11px]">
                              {member.userEmail}
                              {member.role === "admin" && (
                                <span className="text-primary ml-1 font-medium">(admin)</span>
                              )}
                            </span>
                          </div>
                          <Button
                            aria-label={`Remove ${member.userName}`}
                            onClick={() => handleRemoveMember(member.userId)}
                            size="icon-sm"
                            variant="ghost"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : settingsTab === "events" ? (
                <div className="flex flex-col gap-4 p-4">
                  <div>
                    <h4 className="font-heading text-sm font-medium">Global Events</h4>
                    <p className="text-muted-foreground text-[11px]">
                      Important logs are always shown. Enable additional log types you want to see in the Global Events
                      panel.
                    </p>
                  </div>
                  {Object.entries(logTypesByCategory()).map(([category, types]) => (
                    <div className="flex flex-col gap-2" key={category}>
                      <h5 className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
                        {category}
                      </h5>
                      <div className="flex flex-col gap-2">
                        {types.map((logType) => {
                          const enabled = settings.globalEvents.enabledLogTypes.includes(logType.type);
                          return (
                            <div className="flex items-start justify-between gap-3" key={logType.type}>
                              <div className="flex flex-col">
                                <Label className="text-xs font-medium" htmlFor={`log-${logType.type}`}>
                                  {logType.label}
                                  {logType.important && (
                                    <span className="text-muted-foreground ml-1.5 text-[10px]">(always on)</span>
                                  )}
                                  {logType.highVolume && (
                                    <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                                      high volume
                                    </span>
                                  )}
                                </Label>
                                <span className="text-muted-foreground text-[11px]">{logType.description}</span>
                              </div>
                              <Switch
                                checked={logType.important || enabled}
                                disabled={logType.important}
                                id={`log-${logType.type}`}
                                onCheckedChange={(checked) => {
                                  setSettings((prev) => {
                                    const next = new Set(prev.globalEvents.enabledLogTypes);
                                    if (checked) next.add(logType.type);
                                    else next.delete(logType.type);
                                    return { globalEvents: { enabledLogTypes: Array.from(next) } };
                                  });
                                }}
                                size="sm"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <Field label="Facility name">
                    <Input
                      onChange={(e) => setSettingsName(e.target.value)}
                      placeholder="Enter facility name"
                      value={settingsName}
                    />
                  </Field>
                </div>
              )}
              <Separator />
              <DialogFooter className="p-4 pt-0">
                <div className="flex w-full items-center justify-between">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        disabled={deleting || monitoringStatus === "running"}
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
                    </TooltipTrigger>
                    {(deleting || monitoringStatus === "running") && (
                      <TooltipContent>
                        {monitoringStatus === "running"
                          ? "Stop the monitoring service before deleting this facility."
                          : "Facility is being deleted."}
                      </TooltipContent>
                    )}
                  </Tooltip>
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

      {/* ── Import warning dialog ── */}
      <Dialog onOpenChange={setImportConfirmOpen} open={importConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-amber-500" />
              Replace existing layout?
            </DialogTitle>
            <DialogDescription>
              The canvas already has {placedItems.length} item{placedItems.length !== 1 ? "s" : ""}. Importing will
              replace all of them. You can use Undo to restore the current layout if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                setImportConfirmOpen(false);
                setPendingImportFile(null);
              }}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmImport} size="sm" variant="default">
              <FileJsonIcon className="mr-1.5 size-3.5" />
              Replace and import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Logs Dialog (all events) ── */}
      <AllEventsDialog
        events={allEvents}
        onClearLogs={handleClearContainerLogs}
        onOpenChange={setLogsOpen}
        open={logsOpen}
      />

      {/* ── Resizable Panels ── */}
      <ResizablePanelGroup className="flex-1" orientation="horizontal">
        {/* Left panel — logs (monitoring) / component palette (edit) */}
        <ResizablePanel defaultSize={22} minSize={8}>
          {editMode === "monitoring" ? (
            <GlobalEventsPanel
              events={facilityEventViews}
              onSelectDevice={selectMonitoringDevice}
              onSelectEvent={selectMonitoringEvent}
              selection={monitoringSelection}
            />
          ) : (
            <ComponentPalette />
          )}
        </ResizablePanel>

        <ResizableHandle
          className="hover:bg-accent/50 w-1.5 transition-colors after:w-2 data-[orientation=horizontal]:w-1.5"
          withHandle
        />

        {/* Center panel — 2D canvas or 3D view */}
        <ResizablePanel defaultSize={56} minSize={30}>
          <div className="relative h-full w-full" ref={canvasAreaRef}>
            {isLoading ? (
              <div className="bg-background flex h-full w-full items-center justify-center">
                <span className="text-muted-foreground/50 text-xs">Loading facility…</span>
              </div>
            ) : layoutView === "3d" ? (
              <Suspense
                fallback={
                  <div className="bg-background flex h-full w-full items-center justify-center">
                    <Loader2 className="text-muted-foreground size-8 animate-spin" />
                  </div>
                }
              >
                <Facility3DView
                  facilityId={facilityId}
                  isDark={isDark}
                  onHoverItem={handleHoverItem}
                  onHoverMove={handleHoverMove}
                  onSelectItem={(id) => {
                    if (editMode === "monitoring") {
                      if (id) selectMonitoringDevice(id);
                      else {
                        setMonitoringSelection(null);
                        setSelectedItemId(null);
                      }
                    } else {
                      setSelectedItemId(id);
                    }
                  }}
                  placedItems={placedItems}
                  readOnly={editMode === "monitoring"}
                  selectedItemId={editMode === "monitoring" ? monitoringDeviceId : selectedItemId}
                />
              </Suspense>
            ) : (
              <CanvasEditor
                onAddItem={addPlacedItem}
                onDeleteItems={deleteItems}
                onHoverItem={handleHoverItem}
                onHoverMove={handleHoverMove}
                onMoveDown={moveItemDown}
                onMoveToBack={moveItemToBack}
                onMoveToFront={moveItemToFront}
                onMoveUp={moveItemUp}
                onSelectItem={(id) => {
                  if (editMode === "monitoring") {
                    if (id) selectMonitoringDevice(id);
                    else {
                      setMonitoringSelection(null);
                      setSelectedItemId(null);
                    }
                  } else {
                    setSelectedItemId(id);
                  }
                }}
                onUpdateItem={updatePlacedItem}
                placedItems={placedItems}
                readOnly={editMode === "monitoring"}
                selectedItemId={editMode === "monitoring" ? monitoringDeviceId : selectedItemId}
              />
            )}
            {isImporting && (
              <div className="bg-background/80 absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                <Loader2 className="text-primary size-8 animate-spin" />
                <span className="text-muted-foreground text-sm">Importing facility layout…</span>
              </div>
            )}
            <FacilityHoverCard
              containerRef={canvasAreaRef}
              item={placedItems.find((i) => i.id === hoveredItemId) ?? null}
              x={hoverPos.x}
              y={hoverPos.y}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle
          className="hover:bg-accent/50 w-1.5 transition-colors after:w-2 data-[orientation=horizontal]:w-1.5"
          withHandle
        />

        {/* Right panel — properties (edit) / device logs (monitoring) */}
        <ResizablePanel defaultSize={22} minSize={8}>
          {editMode === "monitoring" ? (
            <MonitoringDetailsPanel
              devices={placedItems}
              events={facilityEventViews}
              facilityId={facilityId}
              onSelectDevice={selectMonitoringDevice}
              selection={monitoringSelection}
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
