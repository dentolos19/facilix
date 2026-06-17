import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, lt } from "drizzle-orm";
import { createDatabase, schema } from "#/lib/database";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FacilityEventRow {
  id: string;
  facilityId: string;
  deviceId: string | null;
  severity: "info" | "warn" | "error";
  type: string;
  message: string;
  data: string;
  createdAt: Date;
  updatedAt: Date;
}

function toRow(r: typeof schema.facilityEvent.$inferSelect): FacilityEventRow {
  return {
    id: r.id,
    facilityId: r.facilityId,
    deviceId: r.deviceId,
    severity: r.severity as "info" | "warn" | "error",
    type: r.type,
    message: r.message,
    data: JSON.stringify(r.data),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ─── Server functions ──────────────────────────────────────────────────────

/**
 * Get paginated facility-level events for a facility.
 * Results are newest-first, limited to `limit` (default 200, max 500).
 * Pass `before` (ISO timestamp or Date) for cursor-based pagination.
 */
export const getFacilityEvents = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; limit?: number; before?: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const limit = Math.min(Math.max(1, data.limit ?? 200), 500);

    const conditions = [eq(schema.facilityEvent.facilityId, data.facilityId)];

    if (data.before) {
      conditions.push(lt(schema.facilityEvent.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select()
      .from(schema.facilityEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(limit);

    return rows.map(toRow);
  });

/**
 * Get paginated events for a specific device.
 * Results are newest-first, limited to `limit` (default 200, max 500).
 * Pass `before` (ISO timestamp or Date) for cursor-based pagination.
 */
export const getDeviceEvents = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; deviceId: string; limit?: number; before?: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.deviceId) throw new Error("Device ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const limit = Math.min(Math.max(1, data.limit ?? 200), 500);

    const conditions = [
      eq(schema.facilityEvent.facilityId, data.facilityId),
      eq(schema.facilityEvent.deviceId, data.deviceId),
    ];

    if (data.before) {
      conditions.push(lt(schema.facilityEvent.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select()
      .from(schema.facilityEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(limit);

    return rows.map(toRow);
  });
