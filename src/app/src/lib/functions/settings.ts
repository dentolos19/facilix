import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";

export interface SimulationStatus {
  running: boolean;
  state: string;
  source: "fly" | "local" | "none";
  appName: null;
  machineId: null;
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export const getSimulationStatus = createServerFn({ method: "GET" }).handler(async (): Promise<SimulationStatus> => {
  const simulatorUrl = (env as { SIMULATOR_URL?: string }).SIMULATOR_URL ?? "";
  if (simulatorUrl) {
    const healthy = await checkHealth(simulatorUrl);
    if (healthy) {
      return { running: true, state: "started", source: "fly", appName: null, machineId: null };
    }
  }

  return { running: false, state: "unreachable", source: "none", appName: null, machineId: null };
});
