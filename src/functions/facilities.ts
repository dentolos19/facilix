import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { createDatabase, schema } from "#/lib/database";
import type { CanvasLayoutData, PlacedItemType } from "#/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function toFacilityRow(
  f: typeof schema.facility.$inferSelect,
): FacilityRow {
  return {
    id: f.id,
    name: f.name,
    data: f.data as CanvasLayoutData,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

// ─── Exported types ───────────────────────────────────────────────────────

export type FacilityRow = {
  id: string;
  name: string;
  data: CanvasLayoutData;
  createdAt: string;
  updatedAt: string;
};

export interface DeviceRow {
  id: string;
  name: string;
  type: PlacedItemType;
  status: string;
  data: Record<string, string | number>;
  notes: string;
}

export interface FacilitySnapshot {
  id: string;
  name: string;
  canvasData: CanvasLayoutData;
  devices: DeviceRow[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveInput {
  facilityId: string;
  canvasData: CanvasLayoutData;
  devices: DeviceRow[];
}

// ─── CRUD server functions ────────────────────────────────────────────────

export const getFacilities = createServerFn({ method: "GET" }).handler(async () => {
  const db = createDatabase(env.DB);
  const facilities = await db.select().from(schema.facility);
  return facilities.map(toFacilityRow);
});

export const createFacility = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => {
    if (!data.name || typeof data.name !== "string") {
      throw new Error("Name is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DB);
    const id = crypto.randomUUID();
    const now = new Date();

    const [facility] = await db
      .insert(schema.facility)
      .values({
        id,
        name: data.name,
        data: { version: 1, items: [] },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toFacilityRow(facility);
  });

/**
 * Load the full editor state for a facility.
 */
export const loadFacility = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => {
    if (!data.id) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DB);

    const [fac] = await db
      .select()
      .from(schema.facility)
      .where(eq(schema.facility.id, data.id))
      .limit(1);

    if (!fac) throw new Error("Facility not found");

    const devices = await db
      .select()
      .from(schema.facilityDevice)
      .where(eq(schema.facilityDevice.facilityId, data.id));

    const snapshot: FacilitySnapshot = {
      id: fac.id,
      name: fac.name,
      canvasData: fac.data as CanvasLayoutData,
      devices: devices.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type as PlacedItemType,
        status: d.status,
        data: d.data,
        notes: d.notes ?? "",
      })),
      createdAt: fac.createdAt.toISOString(),
      updatedAt: fac.updatedAt.toISOString(),
    };

    return snapshot;
  });

/**
 * Save the full editor state for a facility.
 *
 * - Updates facilities.data with canvas-layout metadata only.
 * - Upserts each device row (preserves IDs so device_log FK references stay valid).
 * - Deletes devices that were removed from the canvas.
 */
export const saveFacility = createServerFn({ method: "POST" })
  .inputValidator((data: SaveInput) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.canvasData) throw new Error("Canvas data is required");
    if (!Array.isArray(data.devices)) throw new Error("Devices array is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DB);
    const now = new Date();
    const incomingIds = new Set(data.devices.map((d) => d.id));

    // 1. Update the facility row (canvas layout metadata)
    await db
      .update(schema.facility)
      .set({
        data: data.canvasData,
        updatedAt: now,
      })
      .where(eq(schema.facility.id, data.facilityId));

    // 2. Delete devices that are no longer in the canvas
    const existing = await db
      .select({ id: schema.facilityDevice.id })
      .from(schema.facilityDevice)
      .where(eq(schema.facilityDevice.facilityId, data.facilityId));

    const orphanIds = existing
      .filter((e) => !incomingIds.has(e.id))
      .map((e) => e.id);

    if (orphanIds.length > 0) {
      await db
        .delete(schema.facilityDevice)
        .where(
          and(
            eq(schema.facilityDevice.facilityId, data.facilityId),
            inArray(schema.facilityDevice.id, orphanIds),
          ),
        );
    }

    // 3. Upsert each device
    for (const dev of data.devices) {
      await db
        .insert(schema.facilityDevice)
        .values({
          id: dev.id,
          facilityId: data.facilityId,
          name: dev.name,
          type: dev.type,
          status: dev.status,
          data: dev.data,
          notes: dev.notes,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.facilityDevice.id,
          set: {
            name: dev.name,
            type: dev.type,
            status: dev.status,
            data: dev.data,
            notes: dev.notes,
            updatedAt: now,
          },
        });
    }

    // 4. Return the updated snapshot
    return loadFacility({ data: { id: data.facilityId } });
  });
