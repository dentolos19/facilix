import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { createLogger } from "#/lib/logs";
import type { FacilityStatusEntry, MonitoringStatus } from "#/lib/monitoring/types";

const log = createLogger("server-functions");

/** Origin the monitoring container uses to call back to the Worker API. */
const APP_ORIGIN = env.APP_ORIGIN ?? "https://facilix.dennise.me";
const SIMULATION_SENSOR_API =
  (env as { SIMULATION_SENSOR_API?: string }).SIMULATION_SENSOR_API ?? "http://host.docker.internal:3002";

/** Roboflow API configuration passed to the container for video processing. */
const ROBOFLOW_API_KEY = (env as { ROBOFLOW_API_KEY?: string }).ROBOFLOW_API_KEY ?? "";
const ROBOFLOW_API_BASE = "https://serverless.roboflow.com";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Map Container state from `getState()` to our simplified MonitoringStatus.
 *
 * Container states from @cloudflare/containers:
 *   - "starting"      (pre-health, booting)
 *   - "healthy"       (fully running, accepting traffic)
 *   - "stopping"      (shutting down in response to stop/destroy)
 *   - "stopped"       (exited cleanly)
 *   - "stopped_with_code"  (exited with an error code)
 */
function mapContainerState(state: { status: string }): MonitoringStatus {
  switch (state.status) {
    case "healthy":
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
    try {
      const stub = env.SERVER.getByName(data.facilityId);
      await stub.startAndWaitForPorts({
        startOptions: {
          envVars: {
            FACILITY_ID: data.facilityId,
            APP_ORIGIN: APP_ORIGIN,
            INGEST_TOKEN: env.INGEST_TOKEN ?? "",
            SIMULATION_SENSOR_API,
            ROBOFLOW_API_KEY,
            ROBOFLOW_API_BASE,
          },
        },
      });
      return { facilityId: data.facilityId, status: "running" } satisfies MonitoringActionResult;
    } catch {
      return { facilityId: data.facilityId, status: "error" } satisfies MonitoringActionResult;
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
    try {
      const stub = env.SERVER.getByName(data.facilityId);
      await stub.stop();
      // Give the container a moment to transition to stopped state
      const ret = await stub.getState();
      return { facilityId: data.facilityId, status: mapContainerState(ret) } satisfies MonitoringActionResult;
    } catch {
      return { facilityId: data.facilityId, status: "error" } satisfies MonitoringActionResult;
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
    const results: FacilityStatusEntry[] = [];

    for (const id of data.facilityIds) {
      try {
        const stub = env.SERVER.getByName(id);
        const state = await stub.getState();
        results.push({ id, status: mapContainerState(state) });
      } catch {
        results.push({ id, status: "error" });
      }
    }

    return results;
  });
