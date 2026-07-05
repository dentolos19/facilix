import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { getAccessContext, requireAccessContext, requireFacilityAccess } from "#/lib/functions/access";
import type { CanvasLayoutData, JsonObject, PlacedItemType } from "#/routes/(platform)/facility.$id/-helpers/types";

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
 * Delete a facility and all its related zones, devices, and logs (cascade).
 */
export const deleteFacility = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => {
    if (!data.id) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.id);
    await db.delete(schema.facility).where(eq(schema.facility.id, data.id));
    return { success: true };
  });
