import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { normalizeFacilitySettings, shouldShowInGlobalEvents } from "#/lib/monitoring/logs";
import type { EventMediaKind, EventMediaRole, EventMediaVariant } from "#/lib/monitoring/utils";
import type { JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FacilityEventRow {
  id: string;
  facilityId: string;
  deviceId: string | null;
  severity: "info" | "warn" | "error";
  type: string;
  message: string;
  data: JsonObject;
  media: FacilityEventMediaRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FacilityEventMediaRow {
  id: string;
  assetId: string;
  name: string;
  type: string;
  size: number;
  kind: EventMediaKind;
  variant: EventMediaVariant;
  role: EventMediaRole;
  sortOrder: number;
  metadata: JsonObject;
  url: string;
}

export interface FacilityEventView extends FacilityEventRow {
  deviceName: string;
  deviceType: string;
  zoneName?: string;
}

function toRow(r: typeof schema.facilityEvent.$inferSelect): FacilityEventRow {
  return {
    id: r.id,
    facilityId: r.facilityId,
    deviceId: r.deviceId,
    severity: r.severity as "info" | "warn" | "error",
    type: r.type,
    message: r.message,
    data: r.data,
    media: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function attachMedia(
  db: ReturnType<typeof createDatabase>,
  events: FacilityEventRow[],
): Promise<FacilityEventRow[]> {
  if (events.length === 0) return events;

  const rows = await db
    .select({
      id: schema.eventMedia.id,
      eventId: schema.eventMedia.eventId,
      assetId: schema.eventMedia.assetId,
      kind: schema.eventMedia.kind,
      variant: schema.eventMedia.variant,
      role: schema.eventMedia.role,
      sortOrder: schema.eventMedia.sortOrder,
      metadata: schema.eventMedia.metadata,
      name: schema.asset.name,
      type: schema.asset.type,
      size: schema.asset.size,
    })
    .from(schema.eventMedia)
    .innerJoin(schema.asset, eq(schema.eventMedia.assetId, schema.asset.id))
    .where(
      inArray(
        schema.eventMedia.eventId,
        events.map((event) => event.id),
      ),
    )
    .orderBy(asc(schema.eventMedia.sortOrder), asc(schema.eventMedia.createdAt));

  const byEvent = new Map<string, FacilityEventMediaRow[]>();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push({
      id: row.id,
      assetId: row.assetId,
      name: row.name,
      type: row.type,
      size: row.size,
      kind: row.kind as EventMediaKind,
      variant: row.variant as EventMediaVariant,
      role: row.role as EventMediaRole,
      sortOrder: row.sortOrder,
      metadata: row.metadata,
      url: `/assets/${encodeURIComponent(row.assetId)}`,
    });
    byEvent.set(row.eventId, list);
  }

  return events.map((event) => ({ ...event, media: byEvent.get(event.id) ?? [] }));
}

// ─── Server functions ──────────────────────────────────────────────────────

/**
 * Get paginated facility-level events for a facility, filtered by settings.
 * Events that are disabled in facility settings are excluded.
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

    // Load facility settings for filtering
    const [facRow] = await db
      .select({ settings: schema.facility.settings })
      .from(schema.facility)
      .where(eq(schema.facility.id, data.facilityId))
      .limit(1);
    const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);

    const conditions = [eq(schema.facilityEvent.facilityId, data.facilityId)];

    if (data.before) {
      conditions.push(lt(schema.facilityEvent.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select()
      .from(schema.facilityEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(limit * 3); // Fetch more to account for filtering

    // Filter by settings
    const filtered = rows
      .map(toRow)
      .filter((ev) => shouldShowInGlobalEvents(ev.type, ev.severity, settings))
      .slice(0, limit);

    return attachMedia(db, filtered);
  });

/**
 * Get paginated events for a specific device, filtered by settings.
 * Events that are disabled in facility settings are excluded.
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

    // Load facility settings for filtering
    const [facRow] = await db
      .select({ settings: schema.facility.settings })
      .from(schema.facility)
      .where(eq(schema.facility.id, data.facilityId))
      .limit(1);
    const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);

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
      .limit(limit * 3); // Fetch more to account for filtering

    // Filter by settings
    const filtered = rows
      .map(toRow)
      .filter((ev) => shouldShowInGlobalEvents(ev.type, ev.severity, settings))
      .slice(0, limit);

    return attachMedia(db, filtered);
  });

/**
 * Get ALL events for a facility (unfiltered, for logs dialog).
 * Shows every event regardless of settings.
 * Results are newest-first, limited to `limit` (default 500, max 1000).
 */
export const getAllFacilityEvents = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; limit?: number; before?: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const limit = Math.min(Math.max(1, data.limit ?? 500), 1000);

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

    return attachMedia(db, rows.map(toRow));
  });
