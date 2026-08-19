import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { requireAccessContext, requireFacilityAccess } from "#/lib/functions/access";
import type { JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

export const PROCESS_STATUSES = [
  "queued",
  "running",
  "waiting",
  "paused",
  "errored",
  "terminated",
  "complete",
  "unknown",
] as const;

export type FacilityProcessStatus = (typeof PROCESS_STATUSES)[number];

export interface FacilityProcessRow {
  id: string;
  facilityId: string;
  facilityName: string;
  deviceId: string;
  deviceName: string;
  segmentId: string;
  kind: "segment";
  name: string;
  status: FacilityProcessStatus;
  step: string | null;
  attempt: number | null;
  error: { name: string; message: string } | null;
  output: JsonObject | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ProcessQuery = {
  facilityId?: string;
  status?: FacilityProcessStatus;
  limit?: number;
  before?: string;
};

function asOutput(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function normalizeStatus(status: Awaited<ReturnType<WorkflowInstance["status"]>>["status"]): FacilityProcessStatus {
  return status === "waitingForPause" ? "waiting" : status;
}

async function reconcileProcessStatuses(rows: FacilityProcessRow[]): Promise<FacilityProcessRow[]> {
  const db = createDatabase(env.DATABASE);

  return Promise.all(
    rows.map(async (row) => {
      try {
        const instance = await env.PROCESSOR.get(row.id);
        const live = await instance.status();
        const status = normalizeStatus(live.status);
        const output = asOutput(live.output);
        const error = live.error ?? null;
        const isComplete = status === "complete" || status === "errored" || status === "terminated";
        const unchanged =
          row.status === status &&
          JSON.stringify(row.error) === JSON.stringify(error) &&
          JSON.stringify(row.output) === JSON.stringify(output);

        if (!unchanged) {
          const completedAt = isComplete ? (row.completedAt ?? new Date()) : null;
          await db
            .update(schema.facilityProcess)
            .set({ status, error, output, completedAt, updatedAt: new Date() })
            .where(eq(schema.facilityProcess.id, row.id));
          return { ...row, status, error, output, completedAt, updatedAt: new Date() };
        }

        return row;
      } catch {
        // Retained process records remain visible if Cloudflare has expired the instance.
        return row;
      }
    }),
  );
}

async function queryProcesses(query: ProcessQuery, facilityIds?: string[]): Promise<FacilityProcessRow[]> {
  const db = createDatabase(env.DATABASE);
  const conditions = [];

  if (query.facilityId) conditions.push(eq(schema.facilityProcess.facilityId, query.facilityId));
  if (query.status) conditions.push(eq(schema.facilityProcess.status, query.status));
  if (query.before) conditions.push(lt(schema.facilityProcess.createdAt, new Date(query.before)));
  if (facilityIds) conditions.push(inArray(schema.facilityProcess.facilityId, facilityIds));

  const rows = await db
    .select({
      id: schema.facilityProcess.id,
      facilityId: schema.facilityProcess.facilityId,
      facilityName: schema.facility.name,
      deviceId: schema.facilityProcess.deviceId,
      deviceName: schema.facilityDevice.name,
      segmentId: schema.facilityProcess.segmentId,
      kind: schema.facilityProcess.kind,
      name: schema.facilityProcess.name,
      status: schema.facilityProcess.status,
      step: schema.facilityProcess.step,
      attempt: schema.facilityProcess.attempt,
      error: schema.facilityProcess.error,
      output: schema.facilityProcess.output,
      startedAt: schema.facilityProcess.startedAt,
      completedAt: schema.facilityProcess.completedAt,
      createdAt: schema.facilityProcess.createdAt,
      updatedAt: schema.facilityProcess.updatedAt,
    })
    .from(schema.facilityProcess)
    .innerJoin(schema.facility, eq(schema.facilityProcess.facilityId, schema.facility.id))
    .innerJoin(schema.facilityDevice, eq(schema.facilityProcess.deviceId, schema.facilityDevice.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.facilityProcess.createdAt))
    .limit(Math.min(Math.max(1, query.limit ?? 100), 200));

  return reconcileProcessStatuses(
    rows.map((row) => ({
      ...row,
      kind: row.kind as "segment",
      status: row.status as FacilityProcessStatus,
      error: row.error ?? null,
      output: row.output ?? null,
    })),
  );
}

export const getFacilityProcesses = createServerFn({ method: "GET" })
  .validator((data: Omit<ProcessQuery, "facilityId"> & { facilityId: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (data.status && !PROCESS_STATUSES.includes(data.status)) throw new Error("Invalid process status");
    return data;
  })
  .handler(async ({ data }) => {
    await requireFacilityAccess(data.facilityId);
    return queryProcesses(data);
  });

export const getAccessibleFacilityProcesses = createServerFn({ method: "GET" })
  .validator((data?: Omit<ProcessQuery, "facilityId"> & { facilityId?: string }) => {
    if (data?.status && !PROCESS_STATUSES.includes(data.status)) throw new Error("Invalid process status");
    return data ?? {};
  })
  .handler(async ({ data }) => {
    const context = await requireAccessContext();
    const db = createDatabase(env.DATABASE);
    const memberships = await db
      .select({ facilityId: schema.facilityMember.facilityId })
      .from(schema.facilityMember)
      .where(eq(schema.facilityMember.userId, context.userId));
    const facilityIds = memberships.map((membership) => membership.facilityId);
    if (facilityIds.length === 0) return [];
    return queryProcesses(data, facilityIds);
  });
