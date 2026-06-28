import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FeedCctvDevice {
  id: string;
  name: string;
  status: string;
  videoSource: string;
  simulationStream: string;
  streamUrl: string;
  streamPath: string;
  deviceId: string;
}

export interface FeedSensorDevice {
  id: string;
  name: string;
  status: string;
  sensorType: string;
  unit: string;
  value: number;
  secondaryValue: number | null;
  secondaryUnit: string | null;
  batteryPct: number | null;
  signalRssiDbm: number | null;
  sensorStatus: string;
  timestamp: string;
}

export interface FeedGridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type FeedLayouts = Record<string, FeedGridLayoutItem[]>;

export interface FacilityFeedData {
  facilityId: string;
  facilityName: string;
  cctvDevices: FeedCctvDevice[];
  sensorDevices: FeedSensorDevice[];
  feedLayout: FeedLayouts;
}

// ─── Server Functions ──────────────────────────────────────────────────────

/**
 * Fetch all CCTV and Sensor devices with live data for the facility feed tab.
 * Returns a single batched response instead of per-device requests.
 */
export const getFacilityFeed = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);

    const [facility, devices] = await Promise.all([
      db.select().from(schema.facility).where(eq(schema.facility.id, data.facilityId)).limit(1),
      db.select().from(schema.facilityDevice).where(eq(schema.facilityDevice.facilityId, data.facilityId)),
    ]);

    const facilityName = facility[0]?.name ?? "Unknown Facility";
    const facilityData = (facility[0]?.data as unknown as Record<string, unknown>) ?? {};

    // ── CCTV devices ──────────────────────────────────────────────────────
    const cctvDevices: FeedCctvDevice[] = devices
      .filter((d) => d.type === "CCTV")
      .map((d) => {
        const props = (d.data ?? {}) as Record<string, unknown>;
        return {
          id: d.id,
          name: d.name,
          status: d.status,
          videoSource: String(props.videoSource ?? "simulation"),
          simulationStream: String(props.simulationStream ?? ""),
          streamUrl: String(props.streamUrl ?? ""),
          streamPath: String(props.streamPath ?? ""),
          deviceId: String(props.deviceId ?? ""),
        };
      });

    // ── Sensor devices with latest readings ───────────────────────────────
    const sensorDeviceRows = devices.filter((d) => d.type === "Sensor");

    const sensorReadings = await db
      .select()
      .from(schema.sensorReading)
      .where(eq(schema.sensorReading.facilityId, data.facilityId))
      .orderBy(desc(schema.sensorReading.timestamp));

    // Map latest reading per device
    const latestByDevice = new Map<string, (typeof sensorReadings)[0]>();
    for (const reading of sensorReadings) {
      if (!latestByDevice.has(reading.deviceId)) {
        latestByDevice.set(reading.deviceId, reading);
      }
    }

    const sensorDevices: FeedSensorDevice[] = sensorDeviceRows.map((d) => {
      const props = (d.data ?? {}) as Record<string, unknown>;
      const reading = latestByDevice.get(d.id);
      return {
        id: d.id,
        name: d.name,
        status: d.status,
        sensorType: String(props.sensorType ?? "unknown"),
        unit: String(props.unit ?? ""),
        value: reading?.value ?? 0,
        secondaryValue: reading?.secondaryValue ?? null,
        secondaryUnit: reading?.secondaryUnit ?? null,
        batteryPct: reading?.batteryPct ?? null,
        signalRssiDbm: reading?.signalRssiDbm ?? null,
        sensorStatus: reading?.status ?? "unknown",
        timestamp: reading?.timestamp ? new Date(reading.timestamp).toISOString() : "",
      };
    });

    // ── Feed layout (stored in facility.data.analyticsFeedGrid) ────────────
    const feedLayout = ((facilityData.analyticsFeedGrid as Record<string, unknown>)?.layouts as FeedLayouts) ?? {};

    return {
      facilityId: data.facilityId,
      facilityName,
      cctvDevices,
      sensorDevices,
      feedLayout,
    } satisfies FacilityFeedData;
  });

/**
 * Save only the feed grid layout to facility.data.analyticsFeedGrid.layouts.
 * Does not touch any other fields in facility.data.
 */
export const saveFacilityFeedLayout = createServerFn({ method: "POST" })
  .validator((data: { facilityId: string; layouts: FeedLayouts }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);

    const [facility] = await db.select().from(schema.facility).where(eq(schema.facility.id, data.facilityId)).limit(1);

    if (!facility) throw new Error("Facility not found");

    const currentData = (facility.data as unknown as Record<string, unknown>) ?? {};
    const updatedData = {
      ...currentData,
      analyticsFeedGrid: {
        version: 1,
        layouts: data.layouts,
      },
    } as Record<string, unknown>;

    await db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(schema.facility)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ data: updatedData as any })
      .where(eq(schema.facility.id, data.facilityId));

    return { success: true };
  });
