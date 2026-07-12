"use client";

import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2Icon, Loader2Icon, PlayIcon, RefreshCwIcon, SquareIcon, XCircleIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldLabel } from "#/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import { Switch } from "#/components/ui/switch";
import { useSession } from "#/lib/auth/client";
import { getSimulationStatus, startSimulation, stopSimulation, type SimulationStatus } from "#/lib/functions/settings";

import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/settings")({
  component: Page,
});

const isLocal = import.meta.env.DEV;

const THEME_OPTIONS = [
  { value: "system", label: "System", description: "Follow your device's theme setting" },
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
] as const;

function Page() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PlatformPageHeader description="Manage your application preferences" title="Settings" />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Facilix looks on your device.</CardDescription>
          </CardHeader>
          <CardContent>
            <Field orientation="vertical">
              <FieldLabel htmlFor="theme-select">Theme</FieldLabel>
              <Select onValueChange={(value) => setTheme(value)} value={mounted ? theme : undefined}>
                <SelectTrigger className="w-full" id="theme-select">
                  <SelectValue placeholder="Select a theme" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {mounted && theme && (
              <p className="text-muted-foreground mt-3 text-xs">
                {THEME_OPTIONS.find((o) => o.value === theme)?.description}
              </p>
            )}
          </CardContent>
        </Card>

        <Separator />

        {isLocal ? <LocalSimulatorStatus /> : <FlySimulatorControl />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface SimulatorHealth {
  ok: boolean;
  cctv: { alive: number; total: number };
  sensors: { total: number; online: number };
}

// ---------------------------------------------------------------------------
// Local Simulator Status
// ---------------------------------------------------------------------------

function LocalSimulatorStatus() {
  const [health, setHealth] = useState<SimulatorHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env?.VITE_SIMULATOR_API_URL ?? "http://localhost:3002"}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setHealth((await res.json()) as SimulatorHealth);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const down = checked && !health;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Simulator</CardTitle>
            <CardDescription>Local simulator status</CardDescription>
          </div>
          <Button disabled={loading} onClick={refresh} size="icon" variant="ghost">
            <RefreshCwIcon className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {!checked ? (
              <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
            ) : down ? (
              <XCircleIcon className="text-destructive" />
            ) : (
              <CheckCircle2Icon className="text-emerald-600 dark:text-emerald-400" />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-medium">{!checked ? "Checking\u2026" : down ? "Down" : "Healthy"}</span>
              {health && (
                <span className="text-muted-foreground text-xs">
                  {health.cctv.alive}/{health.cctv.total} streams &middot; {health.sensors.online}/
                  {health.sensors.total} sensors
                </span>
              )}
            </div>
          </div>

          {health && (
            <div className="rounded-md border">
              <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">Details</div>
              <div className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                <span className="text-xs">CCTV Streams</span>
                <span className="text-xs tabular-nums">
                  {health.cctv.alive}/{health.cctv.total} alive
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs">Sensors</span>
                <span className="text-xs tabular-nums">
                  {health.sensors.online}/{health.sensors.total} online
                </span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fly Simulator Control (admin only, production)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<SimulationStatus["overall"], string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting\u2026",
  stopping: "Stopping\u2026",
  partial: "Partial",
  error: "Error",
};

function FlySimulatorControl() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [health, setHealth] = useState<SimulatorHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning = status?.overall === "running";
  const isTransitioning = status?.overall === "starting" || status?.overall === "stopping";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSimulationStatus();
      setStatus(result);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }

    try {
      const hres = await fetch(`${import.meta.env?.VITE_SIMULATOR_API_URL ?? "https://facilix.fly.dev"}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (hres.ok) {
        setHealth((await hres.json()) as SimulatorHealth);
      } else {
        setHealth(null);
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refresh();
  }, [isAdmin, refresh]);

  useEffect(() => {
    if (!isTransitioning) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [isTransitioning, refresh]);

  const handleToggle = async (checked: boolean) => {
    setActionLoading(true);
    setError(null);
    try {
      const result = checked ? await startSimulation() : await stopSimulation();
      setStatus(result);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Simulator</CardTitle>
            <CardDescription>Control the simulator deployment.</CardDescription>
          </div>
          <Button disabled={loading || actionLoading} onClick={refresh} size="icon" variant="ghost">
            <RefreshCwIcon className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={isRunning || isTransitioning}
                disabled={actionLoading || isTransitioning || !status}
                onCheckedChange={handleToggle}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{status ? STATUS_LABELS[status.overall] : "Unknown"}</span>
              </div>
            </div>
            {actionLoading && <Loader2Icon className="text-muted-foreground size-4 animate-spin" />}
          </div>

          {error && <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-xs">{error}</p>}

          {health && (
            <div className="rounded-md border">
              <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">Devices</div>
              <div className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                <span className="text-xs">CCTV Streams</span>
                <span className="text-xs tabular-nums">
                  {health.cctv.alive}/{health.cctv.total} alive
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs">Sensors</span>
                <span className="text-xs tabular-nums">
                  {health.sensors.online}/{health.sensors.total} online
                </span>
              </div>
            </div>
          )}

          {status && status.machines.length > 0 && (
            <div className="rounded-md border">
              <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">Machines</div>
              {status.machines.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{m.id}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {m.region} &middot; {m.imageRef}
                    </span>
                  </div>
                  <span
                    className={
                      m.state === "started"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : m.state === "stopped"
                          ? "text-muted-foreground"
                          : "text-amber-600 dark:text-amber-400"
                    }
                  >
                    {m.state === "started" ? (
                      <PlayIcon className="size-3" />
                    ) : m.state === "stopped" ? (
                      <SquareIcon className="size-3" />
                    ) : (
                      <Loader2Icon className="size-3 animate-spin" />
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
