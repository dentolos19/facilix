"use client";

import {
  ActivityIcon,
  BatteryIcon,
  GripVerticalIcon,
  Loader2Icon,
  MapPinIcon,
  RefreshCwIcon,
  VideoIcon,
  WifiIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout/react";

import { Button } from "#/components/ui/button";
import type { FeedCctvDevice, FeedSensorDevice, FeedLayouts } from "#/lib/functions/facility-feed";
import { getFacilityFeed, saveFacilityFeedLayout } from "#/lib/functions/facility-feed";
import { simulationHlsUrl } from "#/lib/simulation/cctv";
import { cn } from "#/lib/utils";
import { CctvPlayer } from "#/routes/(platform)/facility.$id/-components/cctv-player";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// ─── Types ─────────────────────────────────────────────────────────────────

interface FeedTabProps {
  facilityId: string;
}

interface FeedItem {
  id: string;
  name: string;
  type: "cctv" | "sensor";
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function debounce<Args extends unknown[], R>(fn: (...args: Args) => R, ms: number): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function formatTimestamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

// ─── Default Layout Generator ──────────────────────────────────────────────

const CCTV_DEFAULT_W = 6;
const CCTV_DEFAULT_H = 8;
const SENSOR_DEFAULT_W = 3;
const SENSOR_DEFAULT_H = 4;
const GRID_COLS = 12;

function generateDefaultLayouts(items: FeedItem[]): FeedLayouts {
  const lg: FeedLayouts[string] = [];
  let cursorX = 0;
  let cursorY = 0;
  let maxRowHeight = 0;

  for (const item of items) {
    const w = item.type === "cctv" ? CCTV_DEFAULT_W : SENSOR_DEFAULT_W;
    const h = item.type === "cctv" ? CCTV_DEFAULT_H : SENSOR_DEFAULT_H;

    // Wrap to next row if this item won't fit
    if (cursorX + w > GRID_COLS) {
      cursorX = 0;
      cursorY += maxRowHeight;
      maxRowHeight = 0;
    }

    lg.push({ i: item.id, x: cursorX, y: cursorY, w, h, minW: 2, minH: 2 });
    cursorX += w;
    if (h > maxRowHeight) maxRowHeight = h;
  }

  // Generate responsive layouts by scaling column count
  const md = lg.map((item) => ({
    ...item,
    x: Math.min(item.x, 9),
    w: Math.min(item.w, 10),
  }));

  const sm = lg.map((item) => ({
    ...item,
    x: Math.min(item.x, 3),
    w: Math.min(item.w, 6),
    h: item.h + 2,
  }));

  return { lg, md, sm };
}

// ─── CCTV Feed Card ────────────────────────────────────────────────────────

function CctvFeedCard({ device }: { device: FeedCctvDevice }) {
  const hlsUrl = useMemo(() => {
    const source = device.videoSource;
    if (source === "simulation") {
      const streamName = device.simulationStream;
      return streamName ? simulationHlsUrl(streamName) : null;
    }
    return null;
  }, [device]);

  const streamName = device.simulationStream;

  return (
    <div className="border-border bg-card flex h-full min-h-0 flex-col overflow-hidden rounded-none border">
      <div className="feed-drag-handle border-border flex cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing">
        <VideoIcon className="text-muted-foreground/60 size-3" />
        <span className="text-foreground truncate text-[11px] font-medium">{device.name}</span>
        {device.zoneName && (
          <span className="text-muted-foreground/50 flex items-center gap-0.5 text-[10px]">
            <MapPinIcon className="size-2.5" />
            {device.zoneName}
          </span>
        )}
        <GripVerticalIcon className="text-muted-foreground/40 ml-auto size-3.5 shrink-0" />
      </div>
      <div className="min-h-0 flex-1">
        <CctvPlayer
          className="h-full min-h-0"
          enableExpandedDialog={false}
          hlsUrl={hlsUrl}
          showAdvancedControls
          streamName={streamName}
        />
      </div>
    </div>
  );
}

// ─── Sensor Feed Card ──────────────────────────────────────────────────────

function SensorFeedCard({ device }: { device: FeedSensorDevice }) {
  const isAboveThreshold = device.sensorStatus === "warn" || device.sensorStatus === "error";

  return (
    <div className="border-border bg-card flex h-full min-h-0 flex-col overflow-hidden rounded-none border">
      <div className="feed-drag-handle border-border flex cursor-grab items-center gap-2 border-b px-3 py-2 active:cursor-grabbing">
        <ActivityIcon className="text-muted-foreground/60 size-3" />
        <span className="text-foreground truncate text-[11px] font-medium">{device.name}</span>
        {device.zoneName && (
          <span className="text-muted-foreground/50 flex items-center gap-0.5 text-[10px]">
            <MapPinIcon className="size-2.5" />
            {device.zoneName}
          </span>
        )}
        <GripVerticalIcon className="text-muted-foreground/40 ml-auto size-3.5 shrink-0" />
      </div>
      <div className="min-h-0 flex-1 p-3">
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn("text-3xl font-light tabular-nums", isAboveThreshold ? "text-red-500" : "text-foreground")}
            >
              {device.value.toFixed(1)}
            </span>
            <span className="text-muted-foreground/60 text-sm">{device.unit}</span>
          </div>
          {device.secondaryValue != null && (
            <p className="text-muted-foreground/50 text-[10px]">
              {device.secondaryValue.toFixed(1)} {device.secondaryUnit ?? ""}
            </p>
          )}
          <div className="mt-auto flex items-center gap-3 text-[10px]">
            {device.batteryPct != null && (
              <span className="text-muted-foreground/60 flex items-center gap-1">
                <BatteryIcon className="size-2.5" />
                {device.batteryPct.toFixed(0)}%
              </span>
            )}
            {device.signalRssiDbm != null && (
              <span className="text-muted-foreground/60 flex items-center gap-1">
                <WifiIcon className="size-2.5" />
                {device.signalRssiDbm} dBm
              </span>
            )}
          </div>
          {device.timestamp && (
            <p className="text-muted-foreground/40 mt-1 text-[9px]">{formatTimestamp(device.timestamp)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Feed Tab ─────────────────────────────────────────────────────────

export function FacilityFeedTab({ facilityId }: FeedTabProps) {
  const [cctvDevices, setCctvDevices] = useState<FeedCctvDevice[]>([]);
  const [sensorDevices, setSensorDevices] = useState<FeedSensorDevice[]>([]);
  const [savedLayouts, setSavedLayouts] = useState<FeedLayouts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const layoutsRef = useRef<FeedLayouts>({});

  // ── Fetch feed data ─────────────────────────────────────────────────────
  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getFacilityFeed({ data: { facilityId } });
      setCctvDevices(result.cctvDevices);
      setSensorDevices(result.sensorDevices);
      setSavedLayouts(result.feedLayout);
      layoutsRef.current = result.feedLayout;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // ── Build feed items list ───────────────────────────────────────────────
  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const cam of cctvDevices) {
      items.push({ id: cam.id, name: cam.name, type: "cctv" });
    }
    for (const sensor of sensorDevices) {
      items.push({ id: sensor.id, name: sensor.name, type: "sensor" });
    }
    return items;
  }, [cctvDevices, sensorDevices]);

  // ── Compute effective layouts ───────────────────────────────────────────
  const layouts = useMemo(() => {
    if (Object.keys(savedLayouts).length > 0) {
      // Merge saved layout with any new items that need defaults
      const defaultLayouts = generateDefaultLayouts(feedItems);
      const merged: FeedLayouts = {};

      for (const bp of Object.keys(defaultLayouts)) {
        const savedBp = savedLayouts[bp];
        if (savedBp) {
          // Keep saved items, add any new items that aren't in the saved layout
          const savedIds = new Set(savedBp.map((l) => l.i));
          const newItems = defaultLayouts[bp].filter((l) => !savedIds.has(l.i));
          merged[bp] = [...savedBp, ...newItems];
        } else {
          merged[bp] = defaultLayouts[bp];
        }
      }

      return merged;
    }
    return generateDefaultLayouts(feedItems);
  }, [savedLayouts, feedItems]);

  // ── Save layout debounced ──────────────────────────────────────────────
  const saveLayoutsDebounced = useMemo(
    () =>
      debounce((newLayouts: FeedLayouts) => {
        saveFacilityFeedLayout({ data: { facilityId, layouts: newLayouts } }).catch(() => {
          // Silently fail — layout will be re-saved on next interaction
        });
      }, 800),
    [facilityId],
  );

  const handleLayoutChange = useCallback(
    (_currentLayout: unknown, allLayouts: Record<string, unknown>) => {
      const safe = Object.fromEntries(Object.entries(allLayouts).filter(([, v]) => Array.isArray(v))) as FeedLayouts;
      layoutsRef.current = safe;
      saveLayoutsDebounced(safe);
    },
    [saveLayoutsDebounced],
  );

  const { width, containerRef, mounted } = useContainerWidth();

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="text-muted-foreground/50 size-5 animate-spin" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <VideoIcon className="text-muted-foreground/30 size-8" />
        <p className="text-muted-foreground/50 text-xs">{error}</p>
        <Button onClick={fetchFeed} size="sm" variant="outline">
          <RefreshCwIcon className="mr-1.5 size-3" />
          Retry
        </Button>
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────
  if (feedItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <VideoIcon className="text-muted-foreground/30 size-8" />
          <p className="text-muted-foreground/50 text-xs">No CCTV or sensor devices configured in this facility</p>
        </div>
      </div>
    );
  }

  // ── Device map for quick lookup ────────────────────────────────────────
  const cctvMap = new Map(cctvDevices.map((d) => [d.id, d]));
  const sensorMap = new Map(sensorDevices.map((d) => [d.id, d]));

  return (
    <div className="flex h-full min-h-0 flex-col" ref={containerRef}>
      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        {mounted && (
          <ResponsiveGridLayout
            width={width}
            cols={{ lg: 12, md: 10, sm: 6 }}
            breakpoints={{ lg: 1200, md: 996, sm: 768 }}
            layouts={layouts}
            onLayoutChange={handleLayoutChange}
            rowHeight={30}
            margin={[12, 12]}
            compactor={verticalCompactor}
            dragConfig={{ enabled: true, bounded: false, handle: ".feed-drag-handle", threshold: 3 }}
          >
            {feedItems.map((item) => {
              const cctv = cctvMap.get(item.id);
              const sensor = sensorMap.get(item.id);

              return (
                <div key={item.id} className="feed-card-wrapper">
                  {cctv && <CctvFeedCard device={cctv} />}
                  {sensor && <SensorFeedCard device={sensor} />}
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}
