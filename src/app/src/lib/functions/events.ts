import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { normalizeFacilitySettings, shouldShowInGlobalEvents } from "#/lib/monitoring/logs";
import type { EventAttachmentKind, EventAttachmentRole, EventAttachmentVariant } from "#/lib/monitoring/utils";
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
  attachments: FacilityEventAttachmentRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FacilityEventAttachmentRow {
  id: string;
  assetId: string;
  name: string;
  type: string;
  size: number;
  kind: EventAttachmentKind;
  variant: EventAttachmentVariant;
  role: EventAttachmentRole;
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
    attachments: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function attachEventAttachments(
  db: ReturnType<typeof createDatabase>,
  events: FacilityEventRow[],
): Promise<FacilityEventRow[]> {
  if (events.length === 0) return events;

  const rows = await db
    .select({
      id: schema.eventAttachment.id,
      eventId: schema.eventAttachment.eventId,
      assetId: schema.eventAttachment.assetId,
      kind: schema.eventAttachment.kind,
      variant: schema.eventAttachment.variant,
      role: schema.eventAttachment.role,
      sortOrder: schema.eventAttachment.sortOrder,
      metadata: schema.eventAttachment.metadata,
      name: schema.asset.name,
      type: schema.asset.type,
      size: schema.asset.size,
    })
    .from(schema.eventAttachment)
    .innerJoin(schema.asset, eq(schema.eventAttachment.assetId, schema.asset.id))
    .where(
      inArray(
        schema.eventAttachment.eventId,
        events.map((event) => event.id),
      ),
    )
    .orderBy(asc(schema.eventAttachment.sortOrder), asc(schema.eventAttachment.createdAt));

  const byEvent = new Map<string, FacilityEventAttachmentRow[]>();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push({
      id: row.id,
      assetId: row.assetId,
      name: row.name,
      type: row.type,
      size: row.size,
      kind: row.kind as EventAttachmentKind,
      variant: row.variant as EventAttachmentVariant,
      role: row.role as EventAttachmentRole,
      sortOrder: row.sortOrder,
      metadata: row.metadata,
      url: `/assets/${encodeURIComponent(row.assetId)}`,
    });
    byEvent.set(row.eventId, list);
  }

  return events.map((event) => ({ ...event, attachments: byEvent.get(event.id) ?? [] }));
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

    return attachEventAttachments(db, filtered);
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

    return attachEventAttachments(db, filtered);
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

    return attachEventAttachments(db, rows.map(toRow));
  });
