import { eq } from "drizzle-orm";
import { createDatabase } from "#/src/lib/database";
import * as schema from "#/src/lib/database/schema";

/**
 * Validate that a deviceId belongs to the given facility and return its row.
 */
export async function validateDevice(
  db: ReturnType<typeof createDatabase>,
  facilityId: string,
  deviceId: string,
): Promise<typeof schema.facilityDevice.$inferSelect | null> {
  const [device] = await db.select().from(schema.facilityDevice).where(eq(schema.facilityDevice.id, deviceId)).limit(1);
  return device?.facilityId === facilityId ? device : null;
}

/**
 * Record an event ONLY in the Observer DO's observations table.
 * This is for high-volume / low-importance events that should appear only
 * in Container Logs (heartbeats, frame-ok, sensor readings, etc.).
 */
export async function recordObservation(
  observer: DurableObjectStub<import("./observer").Observer>,
  deviceId: string,
  type: string,
  severity: "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await observer.recordEvent(deviceId, type, JSON.stringify({ level: severity, message, ...data }));
    return true;
  } catch (err) {
    console.error("Observer recordEvent failed:", err);
    return false;
  }
}

/**
 * Record an event ONLY in the D1 facility_events table.
 * This is for important, persistent events (monitoring start/stop,
 * anomalies, alerts, errors, warnings, segment storage, etc.).
 *
 * @returns The event ID on success, or `null` if recording failed.
 */
export async function recordFacilityEvent(
  db: ReturnType<typeof createDatabase>,
  facilityId: string,
  deviceId: string | null,
  type: string,
  severity: "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown> = {},
): Promise<string | null> {
  const id = crypto.randomUUID();
  const now = new Date();

  try {
    await db.insert(schema.facilityEvent).values({
      id,
      facilityId,
      deviceId: deviceId || null,
      severity,
      type,
      message,
      data,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  } catch (err) {
    console.error("D1 facilityEvent insert failed:", err);
    return null;
  }
}

/**
 * Record a structured sensor reading in the sensor_readings table.
 * Extracts reading fields from the event data payload.
 */
export async function recordSensorReading(
  db: ReturnType<typeof createDatabase>,
  facilityId: string,
  deviceId: string,
  eventData: Record<string, unknown>,
): Promise<boolean> {
  const value = eventData.value;
  if (typeof value !== "number") return false;

  try {
    await db.insert(schema.sensorReading).values({
      facilityId,
      deviceId,
      sensorType: String(eventData.sensorType ?? ""),
      value,
      unit: String(eventData.unit ?? ""),
      status: String(eventData.status ?? "ok"),
      secondaryValue: typeof eventData.secondaryValue === "number" ? eventData.secondaryValue : null,
      secondaryUnit: eventData.secondaryUnit ? String(eventData.secondaryUnit) : null,
      batteryPct: typeof eventData.batteryPct === "number" ? eventData.batteryPct : null,
      signalRssiDbm: typeof eventData.signalRssiDbm === "number" ? eventData.signalRssiDbm : null,
      source: String(eventData.source ?? "simulation"),
      timestamp: typeof eventData.timestamp === "number" ? new Date(eventData.timestamp) : new Date(),
    });
    return true;
  } catch (err) {
    console.error("sensor_readings insert failed", err);
    return false;
  }
}
