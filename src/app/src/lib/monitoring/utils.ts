import { eq } from "drizzle-orm";

import type { createDatabase } from "#/lib/database";
import * as schema from "#/lib/database/schema";
import { createLogger } from "#/lib/logs";
import type { JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

const log = createLogger("monitoring-utils");

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export type EventAttachmentKind = "image" | "video";
export type EventAttachmentVariant = "source-segment" | "annotated-frame" | "original-frame";
export type EventAttachmentRole = "primary" | "supporting" | "source";

export interface EventAttachmentInput {
  assetId: string;
  kind: EventAttachmentKind;
  variant: EventAttachmentVariant;
  role?: EventAttachmentRole;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

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
 * Record an event to D1 (persistent storage) and broadcast via Observer DO WebSocket (real-time).
 *
 * This is the single unified function for all event recording. Every event:
 * - Gets persisted to D1 `facility_events` table for querying and display
 * - Gets broadcast to connected WebSocket clients for real-time updates
 */
export async function recordEvent(
  db: ReturnType<typeof createDatabase>,
  observer: DurableObjectStub<import("#/lib/bindings/observer").Observer>,
  facilityId: string,
  deviceId: string | null,
  type: string,
  severity: "info" | "warn" | "error",
  message: string,
  data: Record<string, unknown> = {},
  attachments: EventAttachmentInput[] = [],
): Promise<string | null> {
  const id = crypto.randomUUID();
  const now = new Date();

  // 1. Persist to D1
  try {
    await db.insert(schema.facilityEvent).values({
      id,
      facilityId,
      deviceId: deviceId || null,
      severity,
      type,
      message,
      data: toJsonObject(data),
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    log.error("D1 facilityEvent insert failed", { error: String(err), facilityId, type });
    return null;
  }

  // Attachments are optional evidence. A bad or stale asset reference must
  // not drop the event itself.
  if (attachments.length > 0) {
    try {
      await db
        .insert(schema.eventAttachment)
        .values(
          attachments.map((item, index) => ({
            eventId: id,
            assetId: item.assetId,
            kind: item.kind,
            variant: item.variant,
            role: item.role ?? "supporting",
            sortOrder: item.sortOrder ?? index,
            metadata: toJsonObject(item.metadata ?? {}),
            createdAt: now,
          })),
        )
        .onConflictDoNothing();
    } catch (err) {
      log.error("D1 eventAttachment insert failed", {
        error: String(err),
        eventId: id,
        attachmentCount: attachments.length,
      });
    }
  }

  // 2. Broadcast via Observer DO WebSocket for real-time updates
  try {
    await observer.recordEvent(deviceId ?? facilityId, type, JSON.stringify({ level: severity, message, ...data }));
  } catch (err) {
    log.error("Observer recordEvent failed", { error: String(err), deviceId, type });
    // Don't return null - D1 write succeeded, broadcast is best-effort
  }

  return id;
}

/**
 * Validate that a sensor type is valid and return the device row.
 */
export async function validateSensorDevice(
  db: ReturnType<typeof createDatabase>,
  facilityId: string,
  deviceId: string,
): Promise<typeof schema.facilityDevice.$inferSelect | null> {
  const device = await validateDevice(db, facilityId, deviceId);
  return device?.type === "Sensor" ? device : null;
}

/**
 * Record a sensor reading to the sensor_readings table.
 */
export async function recordSensorReading(
  db: ReturnType<typeof createDatabase>,
  facilityId: string,
  deviceId: string,
  data: Record<string, unknown>,
): Promise<string | null> {
  const id = crypto.randomUUID();
  const now = new Date();

  const sensorType = String(data.sensorType ?? "unknown");
  const value = Number(data.value ?? 0);
  const unit = String(data.unit ?? "");
  const status = String(data.status ?? "ok");
  const secondaryValue = typeof data.secondaryValue === "number" ? data.secondaryValue : null;
  const secondaryUnit = typeof data.secondaryUnit === "string" ? data.secondaryUnit : null;
  const batteryPct = typeof data.batteryPct === "number" ? data.batteryPct : null;
  const signalRssiDbm = typeof data.signalRssiDbm === "number" ? data.signalRssiDbm : null;
  const source = String(data.source ?? "simulation");
  const timestamp = data.timestamp instanceof Date ? data.timestamp : now;

  try {
    await db.insert(schema.sensorReading).values({
      id,
      facilityId,
      deviceId,
      sensorType,
      value,
      unit,
      status,
      secondaryValue,
      secondaryUnit,
      batteryPct,
      signalRssiDbm,
      source,
      timestamp,
      createdAt: now,
    });
    return id;
  } catch (err) {
    log.error("D1 sensorReading insert failed", { error: String(err), facilityId, deviceId });
    return null;
  }
}
