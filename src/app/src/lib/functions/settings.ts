import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { requireAccessContext } from "#/lib/functions/access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MachineState {
  id: string;
  state: string;
  name: string;
  region: string;
  imageRef: string;
  createdAt: string;
}

export interface SimulationStatus {
  overall: "running" | "stopped" | "starting" | "stopping" | "partial" | "error";
  source: "fly";
  appName: string;
  machines: MachineState[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Fly Machines API helper
// ---------------------------------------------------------------------------

const FLY_API_BASE = "https://api.machines.dev/v1";

function flyHeaders(): Record<string, string> {
  const token = (env as { FLY_API_TOKEN?: string }).FLY_API_TOKEN ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function getAppName(): string {
  return (env as { FLY_APP_NAME?: string }).FLY_APP_NAME ?? "facilix";
}

async function fetchFlyMachines(): Promise<
  { ok: true; machines: Record<string, unknown>[] } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${FLY_API_BASE}/apps/${getAppName()}/machines`, {
      headers: flyHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Fly API returned ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, machines: (await res.json()) as Record<string, unknown>[] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reach Fly API" };
  }
}

async function controlMachine(machineId: string, action: "start" | "stop"): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${FLY_API_BASE}/apps/${getAppName()}/machines/${machineId}/${action}`, {
      method: "POST",
      headers: flyHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Fly API returned ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Request failed" };
  }
}

function normalizeMachines(raw: Record<string, unknown>[]): MachineState[] {
  return raw.map(
    (m): MachineState => ({
      id: String(m.id ?? ""),
      state: String(m.state ?? "unknown"),
      name: String(m.name ?? ""),
      region: String(m.region ?? ""),
      imageRef: m.image_ref
        ? `${(m.image_ref as Record<string, unknown>).registry ?? ""}/${
            (m.image_ref as Record<string, unknown>).repository ?? ""
          }`
        : "",
      createdAt: String(m.created_at ?? ""),
    }),
  );
}

function computeOverall(machines: MachineState[]): SimulationStatus["overall"] {
  if (machines.length === 0) return "error";
  const states = new Set(machines.map((m) => m.state));
  const allStarted = machines.every((m) => m.state === "started");
  const allStopped = machines.every((m) => m.state === "stopped");
  if (allStarted) return "running";
  if (allStopped) return "stopped";
  if (states.has("starting")) return "starting";
  if (states.has("stopping")) return "stopping";
  return "partial";
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * Get the current simulation status from Fly Machines API.
 * Admin only, matching the settings UI that exposes this control.
 */
export const getSimulationStatus = createServerFn({ method: "GET" }).handler(async (): Promise<SimulationStatus> => {
  const ctx = await requireAccessContext();
  if (!ctx.isAdmin) throw new Error("Admin access required");

  const appName = getAppName();
  const machinesResult = await fetchFlyMachines();

  if (!machinesResult.ok) {
    return { overall: "error", source: "fly", appName, machines: [], error: machinesResult.error };
  }

  const machines = normalizeMachines(machinesResult.machines);
  return {
    overall: computeOverall(machines),
    source: "fly",
    appName,
    machines,
  };
});

/**
 * Start all stopped machines for the Fly app. Admin only.
 */
export const startSimulation = createServerFn({ method: "POST" }).handler(async (): Promise<SimulationStatus> => {
  const ctx = await requireAccessContext();
  if (!ctx.isAdmin) throw new Error("Admin access required");

  const appName = getAppName();
  const machinesResult = await fetchFlyMachines();

  if (!machinesResult.ok) {
    return { overall: "error", source: "fly", appName, machines: [], error: machinesResult.error };
  }

  const machines = normalizeMachines(machinesResult.machines);
  const stopped = machines.filter((m) => m.state === "stopped");

  const errors: string[] = [];
  for (const m of stopped) {
    const result = await controlMachine(m.id, "start");
    if (!result.ok) errors.push(`${m.id}: ${result.error}`);
  }

  return {
    overall: errors.length > 0 ? "partial" : "starting",
    source: "fly",
    appName,
    machines,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
});

/**
 * Stop all started machines for the Fly app. Admin only.
 */
export const stopSimulation = createServerFn({ method: "POST" }).handler(async (): Promise<SimulationStatus> => {
  const ctx = await requireAccessContext();
  if (!ctx.isAdmin) throw new Error("Admin access required");

  const appName = getAppName();
  const machinesResult = await fetchFlyMachines();

  if (!machinesResult.ok) {
    return { overall: "error", source: "fly", appName, machines: [], error: machinesResult.error };
  }

  const machines = normalizeMachines(machinesResult.machines);
  const started = machines.filter((m) => m.state === "started");

  const errors: string[] = [];
  for (const m of started) {
    const result = await controlMachine(m.id, "stop");
    if (!result.ok) errors.push(`${m.id}: ${result.error}`);
  }

  return {
    overall: errors.length > 0 ? "partial" : "stopping",
    source: "fly",
    appName,
    machines,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
});
