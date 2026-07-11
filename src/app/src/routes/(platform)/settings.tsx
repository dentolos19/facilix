import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, Loader2Icon, PlayIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { useSession } from "#/lib/auth/client";
import { getSimulationStatus, startSimulation, stopSimulation, type SimulationStatus } from "#/lib/functions/settings";

export const Route = createFileRoute("/(platform)/settings")({
  component: Page,
});

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-lg font-medium tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-xs">Manage your application preferences</p>
        </div>
        <Link to="/dashboard">
          <Button size="sm" variant="outline">
            <ArrowLeftIcon className="size-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how Facilix looks on your device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="theme-select">Theme</Label>
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
            </div>

            {mounted && theme && (
              <p className="text-muted-foreground text-xs">
                {THEME_OPTIONS.find((o) => o.value === theme)?.description}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <SimulatorControl />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulator Control (admin only)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<SimulationStatus["overall"], string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting…",
  stopping: "Stopping…",
  partial: "Partial",
  error: "Error",
};

function SimulatorControl() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [status, setStatus] = useState<SimulationStatus | null>(null);
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
            <CardDescription>Control the Fly.io simulator deployment.</CardDescription>
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
                {status?.appName && <span className="text-muted-foreground text-xs">{status.appName} on Fly.io</span>}
              </div>
            </div>
            {actionLoading && <Loader2Icon className="text-muted-foreground size-4 animate-spin" />}
          </div>

          {error && <p className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-xs">{error}</p>}

          {status && status.machines.length > 0 && (
            <div className="rounded-md border">
              <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">Machines</div>
              {status.machines.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">{m.id}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {m.region} · {m.imageRef}
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
