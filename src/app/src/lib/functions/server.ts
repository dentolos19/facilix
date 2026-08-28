import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { requireFacilityAccess, getAccessContext } from "#/lib/functions/access";
import { createLogger } from "#/lib/logs";
import type { FacilityStatusEntry, MonitoringStatus } from "#/lib/monitoring/types";

const log = createLogger("server-functions");

/** Origin the monitoring container uses to call back to the Worker API. */
const APP_URL = env.APP_URL ?? "https://facilix.dennise.me";

/** Simulator base URL (API + HLS) passed to the monitoring container. */
const SIMULATOR_URL = (env as { SIMULATOR_URL?: string }).SIMULATOR_URL ?? "https://facilix.fly.dev";

/** Model API configuration passed to the container for video processing. */
const ROBOFLOW_API_KEY = (env as { ROBOFLOW_API_KEY?: string }).ROBOFLOW_API_KEY ?? "";
const ROBOFLOW_API_BASE = "https://serverless.roboflow.com";
const STOP_GRACE_PERIOD_MS = 5_000;
const STOP_POLL_INTERVAL_MS = 250;

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Map Container state from `getState()` to our simplified MonitoringStatus.
 *
 * Container states from @cloudflare/containers:
 *   - "running"       (container process is running)
 *   - "healthy"       (fully running, accepting traffic)
 *   - "stopping"      (shutting down in response to stop/destroy)
 *   - "stopped"       (exited cleanly)
 *   - "stopped_with_code"  (exited with an error code)
 */
function mapContainerState(state: { status: string }): MonitoringStatus {
  switch (state.status) {
    case "healthy":
      return "running";
    case "running":
      return "running";
    case "starting":
      return "starting";
    case "stopping":
      return "stopping";
    case "stopped_with_code":
      return "error";
    default:
      return "stopped";
  }
}

function isContainerStopped(state: { status: string }) {
  return state.status === "stopped" || state.status === "stopped_with_code";
}

async function waitForContainerToStop(stub: { getState(): Promise<{ status: string }> }) {
  const deadline = Date.now() + STOP_GRACE_PERIOD_MS;

  while (Date.now() < deadline) {
    if (isContainerStopped(await stub.getState())) return true;
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_INTERVAL_MS));
  }

  return isContainerStopped(await stub.getState());
}

// ─── Exported types ───────────────────────────────────────────────────────

export interface MonitoringActionResult {
  facilityId: string;
  status: MonitoringStatus;
}

// ─── Server Functions ─────────────────────────────────────────────────────

/**
 * Get the current status of a facility's Monitoring container.
 */
export const getMonitoringStatus = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    await requireFacilityAccess(data.facilityId);
    try {
      const stub = env.SERVER.getByName(data.facilityId);
      const state = await stub.getState();
      return { facilityId: data.facilityId, status: mapContainerState(state) } satisfies MonitoringActionResult;
    } catch {
      return { facilityId: data.facilityId, status: "error" } satisfies MonitoringActionResult;
    }
  });

/**
 * Start a facility's Monitoring container.
 *
 * Passes per-instance environment variables so the Python container knows
 * which facility to monitor and where to POST frames, events, and segments.
 */
export const startMonitoring = createServerFn({ method: "POST" })
  .validator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    await requireFacilityAccess(data.facilityId);
    try {
      const stub = env.SERVER.getByName(data.facilityId);
      const state = await stub.getState();
      if (state.status === "healthy") {
        return { facilityId: data.facilityId, status: "running" } satisfies MonitoringActionResult;
      }

      // Local Containers can run the process without completing the SDK port
      // readiness probe. Starting the container is sufficient here; requests to
      // the monitoring service still use the Container SDK's port checks.
      await stub.start({
        envVars: {
          FACILITY_ID: data.facilityId,
          APP_URL: APP_URL,
          SERVER_SECRET: env.SERVER_SECRET ?? "",
          SIMULATOR_URL,
          ROBOFLOW_API_KEY,
          ROBOFLOW_API_BASE,
        },
      });
      return { facilityId: data.facilityId, status: "running" } satisfies MonitoringActionResult;
    } catch (err) {
      log.error("startMonitoring failed", { error: String(err), facilityId: data.facilityId });
      throw new Error(`Failed to start monitoring for facility ${data.facilityId}`, { cause: err });
    }
  });

/**
 * Stop a facility's Monitoring container.
 */
export const stopMonitoring = createServerFn({ method: "POST" })
  .validator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    await requireFacilityAccess(data.facilityId);
    try {
      const stub = env.SERVER.getByName(data.facilityId);
      const state = await stub.getState();
      if (isContainerStopped(state)) {
        return { facilityId: data.facilityId, status: "stopped" } satisfies MonitoringActionResult;
      }

      await stub.stop();
      if (!(await waitForContainerToStop(stub))) {
        log.warn("Graceful monitoring stop timed out; destroying container", { facilityId: data.facilityId });
        await stub.destroy();
      }

      return { facilityId: data.facilityId, status: "stopped" } satisfies MonitoringActionResult;
    } catch (err) {
      log.error("stopMonitoring failed", { error: String(err), facilityId: data.facilityId });
      throw new Error(`Failed to stop monitoring for facility ${data.facilityId}`, { cause: err });
    }
  });

/**
 * Clear all events for a facility.
 * Clears both D1 facility_events (persistent) and Observer DO (WebSocket broadcast).
 */
export const clearContainerLogs = createServerFn({ method: "POST" })
  .validator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    await requireFacilityAccess(data.facilityId);
    try {
      // Clear D1 facility_events
      const db = createDatabase(env.DATABASE);
      await db.delete(schema.facilityEvent).where(eq(schema.facilityEvent.facilityId, data.facilityId));

      // Clear Observer DO and broadcast empty snapshot
      const stub = env.OBSERVER.getByName(data.facilityId);
      await stub.clearEvents();

      return { success: true } as const;
    } catch (err) {
      log.error("clearContainerLogs failed", { error: String(err), facilityId: data.facilityId });
      return { success: false } as const;
    }
  });

/**
 * Batch status check for the dashboard.
 * Returns status for each requested facility ID.
 */
export const getMonitoringStatuses = createServerFn({ method: "POST" })
  .validator((data: { facilityIds: string[] }) => {
    if (!Array.isArray(data.facilityIds)) throw new Error("facilityIds array is required");
    return data;
  })
  .handler(async ({ data }) => {
    const ctx = await getAccessContext();
    if (!ctx || data.facilityIds.length === 0) return [];

    const db = createDatabase(env.DATABASE);
    const allowedFacilityIds = ctx.isAdmin
      ? new Set(data.facilityIds)
      : new Set(
          (
            await db
              .select({ facilityId: schema.facilityMember.facilityId })
              .from(schema.facilityMember)
              .where(
                and(
                  eq(schema.facilityMember.userId, ctx.userId),
                  inArray(schema.facilityMember.facilityId, data.facilityIds),
                ),
              )
          ).map((member) => member.facilityId),
        );
    const results: FacilityStatusEntry[] = [];

    for (const id of data.facilityIds) {
      try {
        if (!allowedFacilityIds.has(id)) continue;
        const stub = env.SERVER.getByName(id);
        const state = await stub.getState();
        results.push({ id, status: mapContainerState(state) });
      } catch {
        results.push({ id, status: "error" });
      }
    }

    return results;
  });
