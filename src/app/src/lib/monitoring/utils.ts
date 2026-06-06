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
 * Record an event in both the D1 device_logs table and the Observer DO.
 *
 * @returns The event ID on success, or `null` if recording failed.
 */
export async function recordFacilityEvent(
  db: ReturnType<typeof createDatabase>,
  observer: DurableObjectStub<import("./observer").Observer>,
  facilityId: string,
  deviceId: string,
  type: string,
  severity: "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown> = {},
): Promise<string | null> {
  const id = crypto.randomUUID();
  let d1Success = false;
  let observerSuccess = false;

  // 1. Insert into D1 device_logs
  try {
    await db.insert(schema.deviceEvent).values({
      id,
      deviceId,
      severity,
      type,
      message,
      data,
    });
    d1Success = true;
  } catch (err) {
    console.error("D1 insert failed", err);
  }

  // 2. Record in Observer DO for real-time forwarding
  try {
    await observer.recordEvent(deviceId, type, JSON.stringify({ level: severity, message, ...data }));
    observerSuccess = true;
  } catch (err) {
    console.error("Observer recordEvent failed", err);
  }

  return d1Success || observerSuccess ? id : null;
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
