import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

import { ensureSimulator, getSimulator } from "#/lib/bindings/simulator";
import { requireAccessContext } from "#/lib/functions/access";

export interface SimulationStatus {
  error?: string;
  overall: "running" | "stopped" | "starting" | "stopping" | "error";
  source: "cloudflare";
}

export interface SimulationStream {
  hlsError: string | null;
  hlsReady: boolean;
  label?: string;
  name: string;
  status: "stopped" | "starting" | "running" | "error";
}

function normalizeStatus(status: string): SimulationStatus["overall"] {
  switch (status) {
    case "healthy":
    case "running":
      return "running";
    case "starting":
      return "starting";
    case "stopping":
      return "stopping";
    case "stopped":
      return "stopped";
    default:
      return "error";
  }
}

function normalizeStream(raw: Record<string, unknown>): SimulationStream {
  const status = String(raw.status ?? "error");
  return {
    hlsError: raw.hls_error ? String(raw.hls_error) : null,
    hlsReady: Boolean(raw.hls_ready),
    label: raw.label ? String(raw.label) : undefined,
    name: String(raw.name ?? ""),
    status: status === "stopped" || status === "starting" || status === "running" ? status : "error",
  };
}

async function fetchSimulator(path: string, init?: RequestInit) {
  const simulator = await ensureSimulator(env);
  return simulator.fetch(new Request(`http://simulator${path}`, init));
}

async function fetchStreams() {
  const response = await fetchSimulator("/cctv", { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Simulator returned ${response.status} while listing streams`);
  const data = (await response.json()) as { streams?: Record<string, unknown>[] };
  return (data.streams ?? []).map(normalizeStream);
}

async function controlStream(name: string, action: "start" | "stop") {
  const response = await fetchSimulator(`/cctv/${encodeURIComponent(name)}/${action}`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => ({}))) as {
    detail?: string;
    error?: string;
    stream?: Record<string, unknown>;
  };
  if (!response.ok || !data.stream) {
    throw new Error(data.detail ?? data.error ?? `Simulator returned ${response.status} while ${action}ing stream`);
  }
  return normalizeStream(data.stream);
}

export const getSimulationStatus = createServerFn({ method: "GET" }).handler(async (): Promise<SimulationStatus> => {
  const context = await requireAccessContext();
  if (!context.isAdmin) throw new Error("Admin access required");

  try {
    const state = await getSimulator(env).getState();
    return { overall: normalizeStatus(state.status), source: "cloudflare" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to read simulator status",
      overall: "error",
      source: "cloudflare",
    };
  }
});

export const startSimulation = createServerFn({ method: "POST" }).handler(async (): Promise<SimulationStatus> => {
  const context = await requireAccessContext();
  if (!context.isAdmin) throw new Error("Admin access required");

  try {
    const simulator = await ensureSimulator(env);
    const state = await simulator.getState();
    return { overall: normalizeStatus(state.status), source: "cloudflare" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to start simulator",
      overall: "error",
      source: "cloudflare",
    };
  }
});

export const stopSimulation = createServerFn({ method: "POST" }).handler(async (): Promise<SimulationStatus> => {
  const context = await requireAccessContext();
  if (!context.isAdmin) throw new Error("Admin access required");

  try {
    const simulator = getSimulator(env);
    const state = await simulator.getState();
    if (state.status === "stopped" || state.status === "stopped_with_code") {
      return { overall: "stopped", source: "cloudflare" };
    }
    await simulator.stop();
    return { overall: "stopping", source: "cloudflare" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to stop simulator",
      overall: "error",
      source: "cloudflare",
    };
  }
});

export const getSimulationStreams = createServerFn({ method: "GET" }).handler(async () => {
  const context = await requireAccessContext();
  if (!context.isAdmin) throw new Error("Admin access required");
  return fetchStreams();
});

export const startSimulationStream = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => {
    if (!data.name) throw new Error("Stream name is required");
    return data;
  })
  .handler(async ({ data }) => {
    const context = await requireAccessContext();
    if (!context.isAdmin) throw new Error("Admin access required");
    return controlStream(data.name, "start");
  });

export const stopSimulationStream = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => {
    if (!data.name) throw new Error("Stream name is required");
    return data;
  })
  .handler(async ({ data }) => {
    const context = await requireAccessContext();
    if (!context.isAdmin) throw new Error("Admin access required");
    return controlStream(data.name, "stop");
  });
