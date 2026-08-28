"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleAlertIcon, RefreshCwIcon, WorkflowIcon } from "lucide-react";
import { startTransition, useEffect, useEffectEvent, useState } from "react";

import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "#/components/ui/table";
import { getFacilities } from "#/lib/functions/facility";
import {
  PROCESS_STATUSES,
  type FacilityProcessRow,
  type FacilityProcessStatus,
  getAccessibleFacilityProcesses,
} from "#/lib/functions/facility-processes";

import { PlatformPageHeader } from "./-components/platform-page-header";

export const Route = createFileRoute("/(platform)/(dashboard)/workflows")({
  component: Page,
});

const ACTIVE_STATUSES = new Set<FacilityProcessStatus>(["queued", "running", "waiting", "paused"]);

const STATUS_STYLES: Record<FacilityProcessStatus, string> = {
  queued: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  running: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  waiting: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  paused: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  errored: "bg-destructive/10 text-destructive",
  terminated: "bg-muted text-muted-foreground",
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  unknown: "bg-muted text-muted-foreground",
};

function statusLabel(status: FacilityProcessStatus) {
  return status === "complete" ? "Completed" : `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function formatTime(value: Date | null) {
  return value ? new Date(value).toLocaleString() : "Not started";
}

function formatDuration(process: FacilityProcessRow) {
  const start = process.startedAt ? new Date(process.startedAt).getTime() : new Date(process.createdAt).getTime();
  const end = process.completedAt ? new Date(process.completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function ProcessStatus({ status }: { status: FacilityProcessStatus }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

function Page() {
  const [processes, setProcesses] = useState<FacilityProcessRow[]>([]);
  const [status, setStatus] = useState<FacilityProcessStatus | "all">("all");
  const [facilityId, setFacilityId] = useState("all");
  const [facilities, setFacilities] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeCount = processes.filter((process) => ACTIVE_STATUSES.has(process.status)).length;
  const hasActiveProcesses = activeCount > 0;

  const loadProcesses = useEffectEvent(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const data = await getAccessibleFacilityProcesses({
        data: {
          facilityId: facilityId === "all" ? undefined : facilityId,
          status: status === "all" ? undefined : status,
        },
      });
      startTransition(() => setProcesses(data as FacilityProcessRow[]));
    } catch {
      setError("Unable to load workflow processes.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  });

  useEffect(() => {
    void loadProcesses();
  }, [facilityId, status]);

  useEffect(() => {
    getFacilities()
      .then((rows) => setFacilities(rows.map((facility) => ({ id: facility.id, name: facility.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasActiveProcesses) return;
    const interval = window.setInterval(() => void loadProcesses(true), 5_000);
    return () => window.clearInterval(interval);
  }, [hasActiveProcesses, facilityId, status]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <PlatformPageHeader description="CCTV segment processing across facilities you belong to" title="Workflows">
        <Button disabled={isRefreshing} onClick={() => void loadProcesses(true)} size="sm" variant="outline">
          <RefreshCwIcon className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </PlatformPageHeader>

      <section aria-label="Workflow summary" className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{activeCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Queued, running, waiting, or paused.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {processes.filter((process) => process.status === "complete").length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Loaded in the current filter.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs Attention</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {processes.filter((process) => process.status === "errored").length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            Processes that Cloudflare reported as errored.
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Process History</CardTitle>
            <CardDescription>Live status refreshes every five seconds while processes are active.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select onValueChange={setFacilityId} value={facilityId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All facilities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All facilities</SelectItem>
                {facilities.map(({ id, name }) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(value) => setStatus(value as FacilityProcessStatus | "all")} value={status}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PROCESS_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {statusLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <p className="text-destructive px-6 py-4 text-sm">{error}</p> : null}
          {isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton className="h-11 w-full" key={index} />
              ))}
            </div>
          ) : processes.length === 0 ? (
            <div className="text-muted-foreground flex min-h-56 flex-col items-center justify-center gap-2 text-center">
              <WorkflowIcon className="size-6" />
              <p className="font-medium">No workflow processes found.</p>
              <p className="max-w-sm text-xs">New CCTV video segments will appear here when processing starts.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Facility</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="w-20">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processes.map((process) => (
                    <TableRow key={process.id}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          params={{ id: process.facilityId }}
                          to="/facility/$id"
                        >
                          {process.facilityName}
                        </Link>
                      </TableCell>
                      <TableCell>{process.deviceName}</TableCell>
                      <TableCell>
                        <ProcessStatus status={process.status} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {process.step ?? "Queued"}
                        {process.attempt ? ` (${process.attempt})` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatTime(process.startedAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDuration(process)}</TableCell>
                      <TableCell>
                        {process.error || process.output ? (
                          <details className="text-xs">
                            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                              View
                            </summary>
                            {process.error ? (
                              <p className="text-destructive mt-2 max-w-72">{process.error.message}</p>
                            ) : null}
                            {process.output ? (
                              <pre className="bg-muted mt-2 max-w-72 overflow-auto p-2 text-[10px] leading-relaxed">
                                {JSON.stringify(process.output, null, 2)}
                              </pre>
                            ) : null}
                          </details>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {processes.some((process) => process.error) ? (
            <div className="border-t px-6 py-3 text-xs">
              <p className="flex items-center gap-2 font-medium">
                <CircleAlertIcon className="text-destructive size-3.5" /> Error details are retained with each process
                record.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
