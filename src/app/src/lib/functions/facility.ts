import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { getAccessContext, requireAccessContext, requireFacilityAccess } from "#/lib/functions/access";
import { parseImportedFacilityLayout } from "#/lib/layouts";
import { createLogger } from "#/lib/logs";
import {
  type CanvasLayoutData,
  type JsonObject,
  type PlacedItem,
  type PlacedItemType,
  toCanvasData,
  toDevicePayloads,
  toZonePayloads,
} from "#/routes/(platform)/facility.$id/-helpers/types";

const log = createLogger("facility");

// ─── Helpers ──────────────────────────────────────────────────────────────

function idList(ids: Iterable<string>) {
  // A JSON parameter keeps large layouts below D1's bound-parameter limit.
  return sql`(select value from json_each(${JSON.stringify([...ids])}))`;
}

function toFacilityRow(f: typeof schema.facility.$inferSelect, isMember = true): FacilityRow {
  return {
    id: f.id,
    name: f.name,
    data: f.data,
    isMember,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// ─── Exported types ───────────────────────────────────────────────────────

export type FacilityRow = {
  id: string;
  name: string;
  data: CanvasLayoutData;
  isMember: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface ZoneRow {
  id: string;
  name: string;
  data: JsonObject;
  notes: string;
}

export interface DeviceRow {
  id: string;
  zoneId: string | null;
  name: string;
  type: PlacedItemType;
  status: string;
  data: JsonObject;
  notes: string;
}

export interface FacilitySnapshot {
  id: string;
  name: string;
  canvasData: CanvasLayoutData;
  zones: ZoneRow[];
  devices: DeviceRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveInput {
  facilityId: string;
  name: string;
  canvasData: CanvasLayoutData;
  zones: ZoneRow[];
  devices: DeviceRow[];
}

// ─── CRUD server functions ────────────────────────────────────────────────

export const getFacilities = createServerFn({ method: "GET" })
  .validator((data?: { includeAll?: boolean }) => data)
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const ctx = await getAccessContext();

    if (!ctx) return [];

    if (ctx.isAdmin && data?.includeAll) {
      const [facilities, memberships] = await Promise.all([
        db.select().from(schema.facility),
        db
          .select({ facilityId: schema.facilityMember.facilityId })
          .from(schema.facilityMember)
          .where(eq(schema.facilityMember.userId, ctx.userId)),
      ]);
      const memberFacilityIds = new Set(memberships.map((membership) => membership.facilityId));
      return facilities.map((facility) => toFacilityRow(facility, memberFacilityIds.has(facility.id)));
    }

    const facilities = await db
      .select({
        id: schema.facility.id,
        name: schema.facility.name,
        data: schema.facility.data,
        settings: schema.facility.settings,
        createdAt: schema.facility.createdAt,
        updatedAt: schema.facility.updatedAt,
      })
      .from(schema.facility)
      .innerJoin(schema.facilityMember, eq(schema.facility.id, schema.facilityMember.facilityId))
      .where(eq(schema.facilityMember.userId, ctx.userId));

    return facilities.map((facility) => toFacilityRow(facility));
  });

export const createFacility = createServerFn({ method: "POST" })
  .validator((data: { name: string; initialItems?: PlacedItem[] }) => {
    if (typeof data.name !== "string" || !data.name.trim()) {
      throw new Error("Name is required");
    }
    if (data.initialItems !== undefined && !Array.isArray(data.initialItems)) {
      throw new Error("Initial layout items must be an array");
    }
    return { ...data, name: data.name.trim() };
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const ctx = await requireAccessContext();
    const initialItems = parseImportedFacilityLayout({ items: data.initialItems ?? [] }, []);

    const [facility] = await db
      .insert(schema.facility)
      .values({
        name: data.name,
        data: toCanvasData(initialItems),
      })
      .returning();

    await db.insert(schema.facilityMember).values({
      facilityId: facility.id,
      userId: ctx.userId,
    });

    const zones = toZonePayloads(facility.id, initialItems);
    if (zones.length > 0) {
      await db.insert(schema.facilityZone).values(zones);
    }

    const devices = toDevicePayloads(facility.id, initialItems);
    if (devices.length > 0) {
      await db.insert(schema.facilityDevice).values(devices);
    }

    return toFacilityRow(facility);
  });

export const duplicateFacility = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => {
    if (!data.id) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const ctx = await requireAccessContext();
    await requireFacilityAccess(data.id);

    const [source] = await db.select().from(schema.facility).where(eq(schema.facility.id, data.id)).limit(1);

    if (!source) throw new Error("Facility not found");

    const [sourceZones, sourceDevices] = await Promise.all([
      db.select().from(schema.facilityZone).where(eq(schema.facilityZone.facilityId, data.id)),
      db.select().from(schema.facilityDevice).where(eq(schema.facilityDevice.facilityId, data.id)),
    ]);

    const idMap = new Map<string, string>();
    const allItems = [...sourceZones.map((z) => z.id), ...sourceDevices.map((d) => d.id)];
    for (const oldId of allItems) {
      idMap.set(oldId, crypto.randomUUID());
    }

    const remappedData: CanvasLayoutData = {
      version: 1,
      items: source.data.items.map((item) => ({
        ...item,
        id: idMap.get(item.id) ?? crypto.randomUUID(),
      })),
    };

    const [newFacility] = await db
      .insert(schema.facility)
      .values({
        name: `${source.name} (Copy)`,
        data: remappedData,
        settings: source.settings,
      })
      .returning();

    const newZones = sourceZones.map((z) => ({
      id: idMap.get(z.id) ?? crypto.randomUUID(),
      facilityId: newFacility.id,
      name: z.name,
      data: z.data,
      notes: z.notes,
    }));

    if (newZones.length > 0) {
      await db.insert(schema.facilityZone).values(newZones);
    }

    const newDevices = sourceDevices.map((d) => ({
      id: idMap.get(d.id) ?? crypto.randomUUID(),
      facilityId: newFacility.id,
      zoneId: d.zoneId ? (idMap.get(d.zoneId) ?? null) : null,
      name: d.name,
      type: d.type,
      status: d.status,
      data: d.data,
      notes: d.notes,
    }));

    if (newDevices.length > 0) {
      await db.insert(schema.facilityDevice).values(newDevices);
    }

    await db.insert(schema.facilityMember).values({
      facilityId: newFacility.id,
      userId: ctx.userId,
    });

    return toFacilityRow(newFacility);
  });

/**
 * Load the full editor state for a facility.
 */
export const loadFacility = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => {
    if (!data.id) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.id);

    const [fac] = await db.select().from(schema.facility).where(eq(schema.facility.id, data.id)).limit(1);

    if (!fac) throw new Error("Facility not found");

    const [zones, devices] = await Promise.all([
      db.select().from(schema.facilityZone).where(eq(schema.facilityZone.facilityId, data.id)),
      db.select().from(schema.facilityDevice).where(eq(schema.facilityDevice.facilityId, data.id)),
    ]);

    const snapshot: FacilitySnapshot = {
      id: fac.id,
      name: fac.name,
      canvasData: fac.data,
      zones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        data: z.data,
        notes: z.notes ?? "",
      })),
      devices: devices.map((d) => ({
        id: d.id,
        zoneId: d.zoneId,
        name: d.name,
        type: d.type as PlacedItemType,
        status: d.status,
        data: d.data,
        notes: d.notes ?? "",
      })),
      createdAt: fac.createdAt,
      updatedAt: fac.updatedAt,
    };

    return snapshot;
  });

/**
 * Save the full editor state for a facility.
 *
 * - Updates facilities.data with canvas-layout metadata only.
 * - Upserts / deletes zone rows to match the incoming zones array.
 * - Upserts / deletes device rows to match the incoming devices array, preserving
 *   IDs so device_event FK references stay valid.
 */
export const saveFacility = createServerFn({ method: "POST" })
  .validator((data: SaveInput) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.name || typeof data.name !== "string") throw new Error("Name is required");
    if (!data.canvasData) throw new Error("Canvas data is required");
    if (!Array.isArray(data.zones)) throw new Error("Zones array is required");
    if (!Array.isArray(data.devices)) throw new Error("Devices array is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);

    const incomingZoneIds = new Set(data.zones.map((zone) => zone.id));
    const incomingDeviceIds = new Set(data.devices.map((device) => device.id));
    if (incomingZoneIds.size !== data.zones.length || incomingDeviceIds.size !== data.devices.length) {
      throw new Error("Facility layout contains duplicate item IDs");
    }
    if (data.devices.some((device) => device.zoneId && !incomingZoneIds.has(device.zoneId))) {
      throw new Error("A device references a zone outside this layout");
    }

    const [foreignZones, foreignDevices] = await Promise.all([
      incomingZoneIds.size
        ? db
            .select({ id: schema.facilityZone.id })
            .from(schema.facilityZone)
            .where(
              and(
                inArray(schema.facilityZone.id, idList(incomingZoneIds)),
                ne(schema.facilityZone.facilityId, data.facilityId),
              ),
            )
            .limit(1)
        : [],
      incomingDeviceIds.size
        ? db
            .select({ id: schema.facilityDevice.id })
            .from(schema.facilityDevice)
            .where(
              and(
                inArray(schema.facilityDevice.id, idList(incomingDeviceIds)),
                ne(schema.facilityDevice.facilityId, data.facilityId),
              ),
            )
            .limit(1)
        : [],
    ]);
    if (foreignZones.length || foreignDevices.length) {
      throw new Error("A layout item belongs to another facility");
    }

    // 1. Update the facility row (name + canvas layout metadata)
    //    Preserve extra fields like analyticsFeedGrid in facility.data
    const [existing] = await db
      .select({ data: schema.facility.data })
      .from(schema.facility)
      .where(eq(schema.facility.id, data.facilityId))
      .limit(1);

    const { analyticsFeedGrid } = existing?.data ?? {};

    const mergedData = {
      ...data.canvasData,
      ...(analyticsFeedGrid != null ? { analyticsFeedGrid } : {}),
    };

    await db
      .update(schema.facility)
      .set({ name: data.name, data: mergedData })
      .where(eq(schema.facility.id, data.facilityId));

    // ── Zones ────────────────────────────────────────────────────────────
    // Fetch existing zone IDs for this facility
    const existingZones = await db
      .select({ id: schema.facilityZone.id })
      .from(schema.facilityZone)
      .where(eq(schema.facilityZone.facilityId, data.facilityId));

    const orphanZoneIds = existingZones.filter((e) => !incomingZoneIds.has(e.id)).map((e) => e.id);

    if (orphanZoneIds.length > 0) {
      await db
        .delete(schema.facilityZone)
        .where(
          and(
            eq(schema.facilityZone.facilityId, data.facilityId),
            inArray(schema.facilityZone.id, idList(orphanZoneIds)),
          ),
        );
    }

    for (const zone of data.zones) {
      await db
        .insert(schema.facilityZone)
        .values({
          id: zone.id,
          facilityId: data.facilityId,
          name: zone.name,
          data: zone.data,
          notes: zone.notes,
        })
        .onConflictDoUpdate({
          target: schema.facilityZone.id,
          setWhere: eq(schema.facilityZone.facilityId, data.facilityId),
          set: {
            name: zone.name,
            data: zone.data,
            notes: zone.notes,
          },
        });
    }

    // ── Devices ──────────────────────────────────────────────────────────
    const existingDevices = await db
      .select({ id: schema.facilityDevice.id })
      .from(schema.facilityDevice)
      .where(eq(schema.facilityDevice.facilityId, data.facilityId));

    const orphanDeviceIds = existingDevices.filter((e) => !incomingDeviceIds.has(e.id)).map((e) => e.id);

    if (orphanDeviceIds.length > 0) {
      await db
        .delete(schema.facilityDevice)
        .where(
          and(
            eq(schema.facilityDevice.facilityId, data.facilityId),
            inArray(schema.facilityDevice.id, idList(orphanDeviceIds)),
          ),
        );
    }

    for (const dev of data.devices) {
      await db
        .insert(schema.facilityDevice)
        .values({
          id: dev.id,
          facilityId: data.facilityId,
          zoneId: dev.zoneId,
          name: dev.name,
          type: dev.type,
          status: dev.status,
          data: dev.data,
          notes: dev.notes,
        })
        .onConflictDoUpdate({
          target: schema.facilityDevice.id,
          setWhere: eq(schema.facilityDevice.facilityId, data.facilityId),
          set: {
            zoneId: dev.zoneId,
            name: dev.name,
            type: dev.type,
            status: dev.status,
            data: dev.data,
            notes: dev.notes,
          },
        });
    }

    // Return the updated snapshot
    return loadFacility({ data: { id: data.facilityId } });
  });

export interface DeviceDetail {
  id: string;
  facilityId: string;
  facilityName: string;
  zoneId: string | null;
  name: string;
  type: PlacedItemType;
  status: string;
  data: JsonObject;
  notes: string;
}

/**
 * Fetch a single device by its ID, including the owning facility name.
 */
export const getDevice = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => {
    if (!data.id) throw new Error("Device ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);

    const [device] = await db
      .select()
      .from(schema.facilityDevice)
      .where(eq(schema.facilityDevice.id, data.id))
      .limit(1);

    if (!device) throw new Error("Device not found");

    await requireFacilityAccess(device.facilityId);

    const [fac] = await db
      .select({ name: schema.facility.name })
      .from(schema.facility)
      .where(eq(schema.facility.id, device.facilityId))
      .limit(1);

    return {
      id: device.id,
      facilityId: device.facilityId,
      facilityName: fac?.name ?? "Unknown Facility",
      zoneId: device.zoneId,
      name: device.name,
      type: device.type as PlacedItemType,
      status: device.status,
      data: device.data,
      notes: device.notes ?? "",
    } satisfies DeviceDetail;
  });

/**
 * Delete a facility and all related data:
 *   - D1 rows owned by this facility (members, zones, devices, events,
 *     attachments, segments, sensor readings, idempotency keys, detection outputs)
 *   - R2 objects for assets that are no longer referenced by any other row
 *   - Observer Durable Object storage for this facility
 *   - Monitoring container for this facility
 */
export const deleteFacility = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => {
    if (!data.id) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.id);

    // 1. Collect facility-owned asset IDs before deleting any rows
    const [segments, frames, events] = await Promise.all([
      db
        .select({ assetId: schema.videoSegment.assetId })
        .from(schema.videoSegment)
        .where(eq(schema.videoSegment.facilityId, data.id)),
      db
        .select({ assetId: schema.videoFrame.assetId })
        .from(schema.videoFrame)
        .where(eq(schema.videoFrame.facilityId, data.id)),
      db
        .select({ assetId: schema.eventAttachment.assetId })
        .from(schema.eventAttachment)
        .innerJoin(schema.facilityEvent, eq(schema.eventAttachment.eventId, schema.facilityEvent.id))
        .where(eq(schema.facilityEvent.facilityId, data.id)),
    ]);

    const facilityAssetIds = new Set<string>();
    for (const s of segments) facilityAssetIds.add(s.assetId);
    for (const f of frames) facilityAssetIds.add(f.assetId);
    for (const a of events) facilityAssetIds.add(a.assetId);

    // 2. Delete facility-owned rows in dependency order (batch = transactional)
    await env.DATABASE.batch([
      env.DATABASE.prepare("DELETE FROM video_frames WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare(
        "DELETE FROM event_attachments WHERE event_id IN (SELECT id FROM facility_events WHERE facility_id = ?)",
      ).bind(data.id),
      env.DATABASE.prepare("DELETE FROM facility_events WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM sensor_readings WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM video_segments WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM idempotency_keys WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM facility_devices WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM facility_zones WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM facility_members WHERE facility_id = ?").bind(data.id),
      env.DATABASE.prepare("DELETE FROM facilities WHERE id = ?").bind(data.id),
    ]);

    // 3. Delete orphan R2 objects and asset rows (only when no longer referenced)
    //    Queries are chunked to stay under D1's ~100 parameter limit.
    if (facilityAssetIds.size > 0) {
      const ids = [...facilityAssetIds];
      const referenced = new Set<string>();
      const CHUNK = 80;

      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const [segRows, frameRows, attRows] = await Promise.all([
          db
            .select({ assetId: schema.videoSegment.assetId })
            .from(schema.videoSegment)
            .where(inArray(schema.videoSegment.assetId, chunk)),
          db
            .select({ assetId: schema.videoFrame.assetId })
            .from(schema.videoFrame)
            .where(inArray(schema.videoFrame.assetId, chunk)),
          db
            .select({ assetId: schema.eventAttachment.assetId })
            .from(schema.eventAttachment)
            .where(inArray(schema.eventAttachment.assetId, chunk)),
        ]);
        for (const r of segRows) referenced.add(r.assetId);
        for (const r of frameRows) referenced.add(r.assetId);
        for (const r of attRows) referenced.add(r.assetId);
      }

      const orphanAssetIds = ids.filter((id) => !referenced.has(id));

      if (orphanAssetIds.length > 0) {
        // Delete R2 objects in batches of up to 1000
        for (let i = 0; i < orphanAssetIds.length; i += 1000) {
          await env.BUCKET.delete(orphanAssetIds.slice(i, i + 1000));
        }

        // Delete asset rows (chunked to stay under parameter limit)
        for (let i = 0; i < orphanAssetIds.length; i += CHUNK) {
          await db.delete(schema.asset).where(inArray(schema.asset.id, orphanAssetIds.slice(i, i + CHUNK)));
        }
      }
    }

    // 4. Clear Observer DO storage for this facility
    try {
      const observer = env.OBSERVER.getByName(data.id);
      await observer.deleteAllStorage();
    } catch (err) {
      log.warn("Observer deleteAllStorage failed (non-fatal)", { error: String(err), facilityId: data.id });
    }

    // 5. Stop monitoring container
    try {
      const server = env.SERVER.getByName(data.id);
      await server.stop();
    } catch {
      // Container may not exist or already stopped — non-fatal
    }

    return { success: true };
  });
