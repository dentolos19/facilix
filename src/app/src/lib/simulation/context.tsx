import { createContext, useContext, useEffect, useState } from "react";

import type { SimulationStatus } from "#/lib/functions/settings";
import { getSimulationStatus } from "#/lib/functions/settings";

function getSimulatorApiBase(): string {
  return import.meta.env?.VITE_SIMULATOR_API_URL ?? "http://localhost:3002";
}

async function checkLocalSimulator(): Promise<boolean> {
  try {
    const res = await fetch(`${getSimulatorApiBase()}/health`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

interface SimulationContextValue {
  simulationEnabled: boolean;
  status: SimulationStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SimulationContext = createContext<SimulationContextValue>({
  simulationEnabled: false,
  status: null,
  loading: true,
  refresh: async () => {},
});

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);

    const localReady = await checkLocalSimulator();
    if (localReady) {
      setStatus({ running: true, state: "started", source: "local", appName: null, machineId: null });
      setLoading(false);
      return;
    }

    try {
      const result = await getSimulationStatus();
      setStatus(result);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const simulationEnabled = status?.running ?? false;

  return (
    <SimulationContext.Provider value={{ simulationEnabled, status, loading, refresh }}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulationSettings() {
  return useContext(SimulationContext);
}
