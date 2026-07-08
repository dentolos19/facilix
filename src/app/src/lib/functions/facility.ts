import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { getAccessContext, requireAccessContext, requireFacilityAccess } from "#/lib/functions/access";
import { createLogger } from "#/lib/logs";
import type { CanvasLayoutData, JsonObject, PlacedItemType } from "#/routes/(platform)/facility.$id/-helpers/types";

const log = createLogger("facility");

// ─── Helpers ──────────────────────────────────────────────────────────────

function toFacilityRow(f: typeof schema.facility.$inferSelect): FacilityRow {
  return {
    id: f.id,
    name: f.name,
    data: f.data as CanvasLayoutData,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

// ─── Exported types ───────────────────────────────────────────────────────

export type FacilityRow = {
  id: string;
  name: string;
  data: CanvasLayoutData;
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

export const getFacilities = createServerFn({ method: "GET" }).handler(async () => {
  const db = createDatabase(env.DATABASE);
  const ctx = await getAccessContext();

  if (!ctx) return [];

  const facilities = ctx.isAdmin
    ? await db.select().from(schema.facility)
    : await db
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

  return facilities.map(toFacilityRow);
});

export const createFacility = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => {
    if (!data.name || typeof data.name !== "string") {
      throw new Error("Name is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const ctx = await requireAccessContext();

    const [facility] = await db
      .insert(schema.facility)
      .values({
        name: data.name,
        data: { version: 1, items: [] },
      })
      .returning();

    await db.insert(schema.facilityMember).values({
      facilityId: facility.id,
      userId: ctx.userId,
    });

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
      canvasData: fac.data as CanvasLayoutData,
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

    // 1. Update the facility row (name + canvas layout metadata)
    //    Preserve extra fields like analyticsFeedGrid in facility.data
    const [existing] = await db
      .select({ data: schema.facility.data })
      .from(schema.facility)
      .where(eq(schema.facility.id, data.facilityId))
      .limit(1);

    const preservedData = (existing?.data as unknown as Record<string, unknown>) ?? {};
    const { analyticsFeedGrid } = preservedData;

    const mergedData = {
      ...data.canvasData,
      ...(analyticsFeedGrid != null ? { analyticsFeedGrid } : {}),
    } as Record<string, unknown>;

    await db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(schema.facility)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({ name: data.name, data: mergedData as any })
      .where(eq(schema.facility.id, data.facilityId));

    // ── Zones ────────────────────────────────────────────────────────────
    const incomingZoneIds = new Set(data.zones.map((z) => z.id));

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
          and(eq(schema.facilityZone.facilityId, data.facilityId), inArray(schema.facilityZone.id, orphanZoneIds)),
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
          set: {
            name: zone.name,
            data: zone.data,
            notes: zone.notes,
          },
        });
    }

    // ── Devices ──────────────────────────────────────────────────────────
    const incomingDeviceIds = new Set(data.devices.map((d) => d.id));

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
            inArray(schema.facilityDevice.id, orphanDeviceIds),
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
 *     attachments, segments, sensor readings, idempotency keys, prediction outputs)
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
    const [segments, predictions, events] = await Promise.all([
      db
        .select({ assetId: schema.videoSegment.assetId })
        .from(schema.videoSegment)
        .where(eq(schema.videoSegment.facilityId, data.id)),
      db
        .select({
          beforeAssetId: schema.predictionOutput.beforeAssetId,
          afterAssetId: schema.predictionOutput.afterAssetId,
        })
        .from(schema.predictionOutput)
        .where(eq(schema.predictionOutput.facilityId, data.id)),
      db
        .select({ assetId: schema.eventAttachment.assetId })
        .from(schema.eventAttachment)
        .innerJoin(schema.facilityEvent, eq(schema.eventAttachment.eventId, schema.facilityEvent.id))
        .where(eq(schema.facilityEvent.facilityId, data.id)),
    ]);

    const facilityAssetIds = new Set<string>();
    for (const s of segments) facilityAssetIds.add(s.assetId);
    for (const p of predictions) {
      facilityAssetIds.add(p.beforeAssetId);
      facilityAssetIds.add(p.afterAssetId);
    }
    for (const a of events) facilityAssetIds.add(a.assetId);

    // 2. Delete facility-owned rows in dependency order (batch = transactional)
    await env.DATABASE.batch([
      env.DATABASE.prepare("DELETE FROM prediction_outputs WHERE facility_id = ?").bind(data.id),
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
    if (facilityAssetIds.size > 0) {
      const ids = [...facilityAssetIds];

      const [remainingSegments, remainingBefore, remainingAfter, remainingAttachments] = await Promise.all([
        db
          .select({ assetId: schema.videoSegment.assetId })
          .from(schema.videoSegment)
          .where(inArray(schema.videoSegment.assetId, ids)),
        db
          .select({ assetId: schema.predictionOutput.beforeAssetId })
          .from(schema.predictionOutput)
          .where(inArray(schema.predictionOutput.beforeAssetId, ids)),
        db
          .select({ assetId: schema.predictionOutput.afterAssetId })
          .from(schema.predictionOutput)
          .where(inArray(schema.predictionOutput.afterAssetId, ids)),
        db
          .select({ assetId: schema.eventAttachment.assetId })
          .from(schema.eventAttachment)
          .where(inArray(schema.eventAttachment.assetId, ids)),
      ]);

      const referenced = new Set<string>();
      for (const r of remainingSegments) referenced.add(r.assetId);
      for (const r of remainingBefore) referenced.add(r.assetId);
      for (const r of remainingAfter) referenced.add(r.assetId);
      for (const r of remainingAttachments) referenced.add(r.assetId);

      const orphanAssetIds = ids.filter((id) => !referenced.has(id));

      if (orphanAssetIds.length > 0) {
        // Delete R2 objects in batches of up to 1000
        for (let i = 0; i < orphanAssetIds.length; i += 1000) {
          await env.BUCKET.delete(orphanAssetIds.slice(i, i + 1000));
        }

        // Delete asset rows
        await db.delete(schema.asset).where(inArray(schema.asset.id, orphanAssetIds));
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
