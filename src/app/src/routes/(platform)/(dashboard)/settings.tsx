"use client";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  Loader2Icon,
  LogOutIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  XCircleIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Field, FieldLabel } from "#/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { hasAdminRole, signOut, useSession } from "#/lib/auth/client";
import {
  getSimulationStatus,
  getSimulationStreams,
  startSimulation,
  startSimulationStream,
  stopSimulation,
  stopSimulationStream,
  type SimulationStatus,
  type SimulationStream,
} from "#/lib/functions/settings";
import { getShowAllFacilitiesPreference, setShowAllFacilitiesPreference } from "#/lib/preferences";

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
  const { data: session, isPending: isSessionPending } = useSession();
  const isAdmin = hasAdminRole(session?.user);
  const userId = session?.user.id;
  const [mounted, setMounted] = useState(false);
  const [showAllFacilities, setShowAllFacilities] = useState(false);
  const [isFacilityPreferenceLoaded, setIsFacilityPreferenceLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isSessionPending) return;

    setShowAllFacilities(isAdmin && userId ? getShowAllFacilitiesPreference(userId) : false);
    setIsFacilityPreferenceLoaded(true);
  }, [isAdmin, isSessionPending, userId]);

  const handleShowAllFacilitiesChange = (checked: boolean) => {
    if (!userId) return;
    setShowAllFacilitiesPreference(userId, checked);
    setShowAllFacilities(checked);
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/" });
  };

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

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Facilities</CardTitle>
              <CardDescription>Configure administrative facility visibility.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="text-sm font-medium" htmlFor="show-all-facilities">
                    Show all facilities
                  </label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Include facilities where you are not listed as a member on the Facilities page.
                  </p>
                </div>
                <Switch
                  checked={showAllFacilities}
                  disabled={!isFacilityPreferenceLoaded}
                  id="show-all-facilities"
                  onCheckedChange={handleShowAllFacilitiesChange}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {isLocal ? <LocalSimulatorStatus isAdmin={isAdmin} /> : <FlySimulatorControl isAdmin={isAdmin} />}

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your account actions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLogout} variant="destructive">
              <LogOutIcon className="size-4" />
              Log Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface SimulatorHealth {
  ok: boolean;
  cctv: { total: number; requested: number; running: number; hlsReady: number; starting: number; failed: number };
  sensors: { total: number; online: number };
}

function simulatorApiUrl() {
  return import.meta.env?.VITE_SIMULATOR_API_URL ?? (isLocal ? "http://localhost:3002" : "https://facilix.fly.dev");
}

// ---------------------------------------------------------------------------
// Local Simulator Status
// ---------------------------------------------------------------------------

function LocalSimulatorStatus({ isAdmin }: { isAdmin: boolean }) {
  const [health, setHealth] = useState<SimulatorHealth | null>(null);
  const [streams, setStreams] = useState<SimulationStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamAction, setStreamAction] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setStreamError(null);
    try {
      const [healthResult, streamsResult] = await Promise.allSettled([
        fetch(`${simulatorApiUrl()}/health`, { signal: AbortSignal.timeout(5000) }),
        isAdmin ? getSimulationStreams() : Promise.resolve<SimulationStream[]>([]),
      ]);
      if (healthResult.status === "fulfilled" && healthResult.value.ok) {
        setHealth((await healthResult.value.json()) as SimulatorHealth);
      } else {
        setHealth(null);
      }
      if (streamsResult.status === "fulfilled") {
        setStreams(streamsResult.value);
      } else {
        setStreams([]);
        setStreamError("Unable to load simulator streams. Check SIMULATOR_URL.");
      }
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const down = checked && !health;

  const handleStreamToggle = async (stream: SimulationStream) => {
    setStreamAction(stream.name);
    setStreamError(null);
    try {
      const updated =
        stream.status === "running" || stream.status === "starting"
          ? await stopSimulationStream({ data: { name: stream.name } })
          : await startSimulationStream({ data: { name: stream.name } });
      setStreams((current) => current.map((item) => (item.name === updated.name ? updated : item)));
      await refresh();
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : `Failed to update ${stream.name}`);
    } finally {
      setStreamAction(null);
    }
  };

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
                  {health.sensors.online}/{health.sensors.total} sensors online
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <CctvStreamControls
              action={streamAction}
              disabled={loading}
              error={streamError}
              onToggle={handleStreamToggle}
              streams={streams}
            />
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

function FlySimulatorControl({ isAdmin }: { isAdmin: boolean }) {
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [streams, setStreams] = useState<SimulationStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [streamAction, setStreamAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRunning = status?.overall === "running";
  const isTransitioning = status?.overall === "starting" || status?.overall === "stopping";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSimulationStatus();
      setStatus(result);
      if (result.error) {
        setError(result.error);
        setStreams([]);
        return;
      }

      if (!result.machines.some((machine) => machine.state === "started")) {
        setStreams([]);
        return;
      }

      try {
        setStreams(await getSimulationStreams());
      } catch {
        setStreams([]);
      }
    } catch {
      setError("Failed to fetch simulator status");
      setStreams([]);
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

  const handleStreamToggle = async (stream: SimulationStream) => {
    setStreamAction(stream.name);
    setError(null);
    try {
      const updated =
        stream.status === "running" || stream.status === "starting"
          ? await stopSimulationStream({ data: { name: stream.name } })
          : await startSimulationStream({ data: { name: stream.name } });
      setStreams((current) => current.map((item) => (item.name === updated.name ? updated : item)));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to update ${stream.name}`);
    } finally {
      setStreamAction(null);
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

          {status?.overall === "running" && (
            <CctvStreamControls
              action={streamAction}
              disabled={actionLoading || isTransitioning}
              error={null}
              onToggle={handleStreamToggle}
              streams={streams}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatStreamLabel(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function CctvStreamControls({
  action,
  disabled,
  error,
  onToggle,
  streams,
}: {
  action: string | null;
  disabled: boolean;
  error: string | null;
  onToggle: (stream: SimulationStream) => Promise<void>;
  streams: SimulationStream[];
}) {
  return (
    <div className="rounded-md border">
      <div className="text-muted-foreground border-b px-3 py-2 text-xs font-medium">CCTV Streams</div>
      {error && <p className="text-destructive bg-destructive/10 px-3 py-2 text-xs">{error}</p>}
      {streams.length === 0 ? (
        <p className="text-muted-foreground px-3 py-2 text-xs">No streams are registered.</p>
      ) : (
        streams.map((stream) => {
          const active = stream.status === "running" || stream.status === "starting";
          const pending = action === stream.name;
          return (
            <div
              className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
              key={stream.name}
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{formatStreamLabel(stream.label ?? stream.name)}</p>
                <p className="text-muted-foreground truncate font-mono text-[10px]">
                  {stream.name} &middot; {stream.hlsReady ? "HLS-ready" : (stream.hlsError ?? stream.status)}
                </p>
              </div>
              <Button
                disabled={pending || disabled}
                onClick={() => void onToggle(stream)}
                size="sm"
                variant={active ? "outline" : "default"}
              >
                {pending ? <Loader2Icon className="animate-spin" /> : active ? <SquareIcon /> : <PlayIcon />}
                {active ? "Stop" : "Start"}
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
}
