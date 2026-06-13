import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { createDatabase, schema } from "#/lib/database";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SensorReadingRow {
  id: string;
  facilityId: string;
  deviceId: string;
  sensorType: string;
  value: number;
  unit: string;
  status: string;
  secondaryValue: number | null;
  secondaryUnit: string | null;
  batteryPct: number | null;
  signalRssiDbm: number | null;
  source: string;
  timestamp: Date;
  createdAt: Date;
}

function toRow(r: typeof schema.sensorReading.$inferSelect): SensorReadingRow {
  return {
    id: r.id,
    facilityId: r.facilityId,
    deviceId: r.deviceId,
    sensorType: r.sensorType,
    value: r.value,
    unit: r.unit,
    status: r.status,
    secondaryValue: r.secondaryValue,
    secondaryUnit: r.secondaryUnit,
    batteryPct: r.batteryPct,
    signalRssiDbm: r.signalRssiDbm,
    source: r.source,
    timestamp: r.timestamp,
    createdAt: r.createdAt,
  };
}

// ─── Server functions ──────────────────────────────────────────────────────

/**
 * Get the latest sensor reading for a given device.
 * Returns null if no reading exists.
 */
export const getLatestSensorReading = createServerFn({ method: "GET" })
  .inputValidator((data: { facilityId: string; deviceId: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.deviceId) throw new Error("Device ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);

    const [reading] = await db
      .select()
      .from(schema.sensorReading)
      .where(
        and(eq(schema.sensorReading.facilityId, data.facilityId), eq(schema.sensorReading.deviceId, data.deviceId)),
      )
      .orderBy(desc(schema.sensorReading.timestamp))
      .limit(1);

    return reading ? toRow(reading) : null;
  });

/**
 * Get sensor reading history for a given device.
 */
export const getSensorReadingHistory = createServerFn({ method: "GET" })
  .inputValidator((data: { facilityId: string; deviceId: string; limit?: number }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.deviceId) throw new Error("Device ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const limit = Math.min(Math.max(1, data.limit ?? 50), 500);

    const readings = await db
      .select()
      .from(schema.sensorReading)
      .where(
        and(eq(schema.sensorReading.facilityId, data.facilityId), eq(schema.sensorReading.deviceId, data.deviceId)),
      )
      .orderBy(desc(schema.sensorReading.timestamp))
      .limit(limit);

    return readings.map(toRow);
  });
