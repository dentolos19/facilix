import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import type { FacilityStatusEntry, MonitorStatus } from "#/lib/monitoring/types";

/** Origin the monitor container uses to call back to the Worker API. */
const APP_ORIGIN = env.APP_ORIGIN ?? "https://facilix.dennise.me";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Map Container state from `getState()` to our simplified MonitorStatus.
 *
 * Container states from @cloudflare/containers:
 *   - "starting"      (pre-health, booting)
 *   - "healthy"       (fully running, accepting traffic)
 *   - "stopping"      (shutting down in response to stop/destroy)
 *   - "stopped"       (exited cleanly)
 *   - "stopped_with_code"  (exited with an error code)
 */
function mapContainerState(state: { status: string }): MonitorStatus {
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

export interface MonitorActionResult {
  facilityId: string;
  status: MonitorStatus;
}

// ─── Server Functions ─────────────────────────────────────────────────────

/**
 * Get the current status of a facility's Monitor container.
 */
export const getMonitorStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const stub = env.MONITOR.getByName(data.facilityId);
      const state = await stub.getState();
      return { facilityId: data.facilityId, status: mapContainerState(state) } satisfies MonitorActionResult;
    } catch {
      return { facilityId: data.facilityId, status: "error" } satisfies MonitorActionResult;
    }
  });

/**
 * Start a facility's Monitor container.
 *
 * Passes per-instance environment variables so the Python container knows
 * which facility to monitor and where to POST frames, events, and segments.
 */
export const startMonitor = createServerFn({ method: "POST" })
  .inputValidator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const stub = env.MONITOR.getByName(data.facilityId);
      await stub.startAndWaitForPorts({
        startOptions: {
          envVars: {
            FACILITY_ID: data.facilityId,
            APP_ORIGIN: APP_ORIGIN,
            MONITOR_INGEST_TOKEN: env.MONITOR_INGEST_TOKEN ?? "",
          },
        },
      });
      return { facilityId: data.facilityId, status: "running" } satisfies MonitorActionResult;
    } catch {
      return { facilityId: data.facilityId, status: "error" } satisfies MonitorActionResult;
    }
  });

/**
 * Stop a facility's Monitor container.
 */
export const stopMonitor = createServerFn({ method: "POST" })
  .inputValidator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("facilityId is required");
    return data;
  })
  .handler(async ({ data }) => {
    try {
      const stub = env.MONITOR.getByName(data.facilityId);
      await stub.stop();
      // Give the container a moment to transition to stopped state
      const ret = await stub.getState();
      return { facilityId: data.facilityId, status: mapContainerState(ret) } satisfies MonitorActionResult;
    } catch {
      return { facilityId: data.facilityId, status: "error" } satisfies MonitorActionResult;
    }
  });

/**
 * Batch status check for the dashboard.
 * Returns status for each requested facility ID.
 */
export const getMonitorStatuses = createServerFn({ method: "POST" })
  .inputValidator((data: { facilityIds: string[] }) => {
    if (!Array.isArray(data.facilityIds)) throw new Error("facilityIds array is required");
    return data;
  })
  .handler(async ({ data }) => {
    const results: FacilityStatusEntry[] = [];

    for (const id of data.facilityIds) {
      try {
        const stub = env.MONITOR.getByName(id);
        const state = await stub.getState();
        results.push({ id, status: mapContainerState(state) });
      } catch {
        results.push({ id, status: "error" });
      }
    }

    return results;
  });
