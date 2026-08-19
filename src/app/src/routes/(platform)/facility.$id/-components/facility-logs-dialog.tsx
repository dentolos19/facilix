import {
  CheckIcon,
  CircleAlertIcon,
  CircleIcon,
  Loader2Icon,
  SearchIcon,
  TerminalIcon,
  Trash2Icon,
  WorkflowIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { PlatformTabs } from "#/components/ui/platform-tabs";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/components/ui/select";
import type { FacilityEventRow } from "#/lib/functions/events";
import {
  type FacilityProcessRow,
  type FacilityProcessStatus,
  getFacilityProcesses,
} from "#/lib/functions/facility-processes";

import { EventSeverityBadge } from "./global-events-panel";

export interface FacilityLogsDialogProps {
  facilityId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All events from D1 facility_events table. */
  events: FacilityEventRow[];
  /** Callback to clear all events. */
  onClearLogs?: () => void;
}

/**
 * Dialog that shows all events for a facility.
 * Shows every event regardless of type or source.
 */
const PROCESS_STEPS = [
  { id: "load-plugins", label: "Load plugins" },
  { id: "load-metadata", label: "Load metadata" },
  { id: "load-previous-segment", label: "Load previous segment" },
  { id: "detect", label: "Run detection workflows" },
  { id: "analyze-segment", label: "Analyze video segment" },
  { id: "save-findings", label: "Save findings" },
] as const;

const DIALOG_TABS = [
  { id: "logs", label: "Logs" },
  { id: "workflows", label: "Workflows" },
];

type StepState = "complete" | "active" | "error" | "pending";

function processStepId(step: string | null) {
  return step?.startsWith("detect-") ? "detect" : step;
}

function processStepState(process: FacilityProcessRow, index: number): StepState {
  if (process.status === "complete") return "complete";
  const currentIndex = PROCESS_STEPS.findIndex((step) => step.id === processStepId(process.step));
  if (currentIndex < 0) return "pending";
  if (index < currentIndex) return "complete";
  if (index > currentIndex) return "pending";
  if (process.status === "errored" || process.status === "terminated") return "error";
  return "active";
}

function StepMarker({ state }: { state: StepState }) {
  if (state === "complete") return <CheckIcon className="size-3.5 text-emerald-500" />;
  if (state === "error") return <CircleAlertIcon className="text-destructive size-3.5" />;
  if (state === "active") return <Loader2Icon className="text-primary size-3.5 animate-spin" />;
  return <CircleIcon className="text-muted-foreground/30 size-3.5" />;
}

function ProcessStatusBadge({ status }: { status: FacilityProcessStatus }) {
  const style =
    status === "complete"
      ? "bg-emerald-500/10 text-emerald-600"
      : status === "errored"
        ? "bg-destructive/10 text-destructive"
        : status === "running"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground";
  return <span className={`${style} px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase`}>{status}</span>;
}

function formatProcessDuration(process: FacilityProcessRow) {
  const start = process.startedAt ? new Date(process.startedAt).getTime() : new Date(process.createdAt).getTime();
  const end = process.completedAt ? new Date(process.completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function ProcessList({ facilityId, open }: { facilityId: string; open: boolean }) {
  const [processes, setProcesses] = useState<FacilityProcessRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const rows = await getFacilityProcesses({ data: { facilityId } });
        if (!cancelled) setProcesses(rows as FacilityProcessRow[]);
      } catch {
        if (!cancelled) setError("Unable to load workflows.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [facilityId, open]);

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="px-6 py-2">
        {isLoading && processes.length === 0 ? (
          <p className="text-muted-foreground px-6 py-8 text-center text-xs">Loading workflows…</p>
        ) : null}
        {error ? <p className="text-destructive px-6 py-4 text-xs">{error}</p> : null}
        {!isLoading && processes.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-xs">
            <WorkflowIcon className="text-muted-foreground/30 size-6" />
            <p>No workflows yet</p>
          </div>
        ) : null}
        <Accordion type="multiple">
          {processes.map((process) => (
            <AccordionItem key={process.id} value={process.id}>
              <AccordionTrigger className="gap-3 py-3 hover:no-underline">
                <WorkflowIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground/80 font-medium">{process.name}</span>
                    <ProcessStatusBadge status={process.status} />
                  </div>
                  <p className="text-muted-foreground/60 mt-0.5 truncate font-mono text-[10px]">
                    {process.step ?? "Queued"}
                    {process.attempt ? ` · Attempt ${process.attempt}` : ""}
                  </p>
                </div>
                <span className="text-muted-foreground/40 mr-2 shrink-0 text-[10px]">
                  {new Date(process.createdAt).toLocaleTimeString()}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4 pl-7">
                <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                  <div>
                    <p className="text-muted-foreground mb-2 text-[10px] font-medium tracking-wider uppercase">
                      Step progress
                    </p>
                    <div className="space-y-2">
                      {PROCESS_STEPS.map((step, index) => {
                        const state = processStepState(process, index);
                        return (
                          <div className="flex items-center gap-2" key={step.id}>
                            <StepMarker state={state} />
                            <span className={state === "pending" ? "text-muted-foreground/50" : "text-foreground/80"}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <dl className="space-y-2 text-[10px]">
                    <div>
                      <dt className="text-muted-foreground">Device</dt>
                      <dd>{process.deviceName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Duration</dt>
                      <dd>{formatProcessDuration(process)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Process ID</dt>
                      <dd className="font-mono break-all">{process.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Segment ID</dt>
                      <dd className="font-mono break-all">{process.segmentId}</dd>
                    </div>
                  </dl>
                </div>
                {process.error ? (
                  <div className="border-destructive/20 bg-destructive/5 text-destructive mt-4 border p-2.5">
                    <p className="font-medium">{process.error.name}</p>
                    <p className="mt-1 leading-relaxed">{process.error.message}</p>
                  </div>
                ) : null}
                {process.output ? (
                  <details className="mt-4">
                    <summary className="text-muted-foreground cursor-pointer text-[10px] font-medium tracking-wider uppercase">
                      Output
                    </summary>
                    <pre className="bg-muted mt-2 max-h-40 overflow-auto p-2.5 text-[10px] leading-relaxed">
                      {JSON.stringify(process.output, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
}

export function FacilityLogsDialog({ facilityId, open, onOpenChange, events, onClearLogs }: FacilityLogsDialogProps) {
  const [activeTab, setActiveTab] = useState("logs");
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<FacilityEventRow["severity"] | "all">("all");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Reset confirmation state when dialog opens
  useEffect(() => {
    if (open) {
      setConfirmDeleteAll(false);
      setActiveTab("logs");
    }
  }, [open]);

  const filteredLogs = useMemo(() => {
    let result = events;

    if (levelFilter !== "all") {
      result = result.filter((ev) => ev.severity === levelFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ev) =>
          ev.type.toLowerCase().includes(q) ||
          (ev.deviceId ?? "").toLowerCase().includes(q) ||
          ev.message.toLowerCase().includes(q),
      );
    }

    return result;
  }, [events, levelFilter, searchQuery]);

  const levelCounts = useMemo(() => {
    const counts = { info: 0, warn: 0, error: 0, total: events.length };
    for (const ev of events) {
      if (ev.severity === "warn") counts.warn++;
      else if (ev.severity === "error") counts.error++;
      else counts.info++;
    }
    return counts;
  }, [events]);

  function handleDeleteAll() {
    if (!confirmDeleteAll) {
      setConfirmDeleteAll(true);
    } else {
      onClearLogs?.();
      setConfirmDeleteAll(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[min(42rem,85vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-border border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4" />
            Logs &amp; Workflows
          </DialogTitle>
          <DialogDescription>Facility event history and CCTV processing status</DialogDescription>
        </DialogHeader>

        <PlatformTabs activeTab={activeTab} onChange={setActiveTab} tabs={DIALOG_TABS} />

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "logs" ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-border flex flex-wrap items-center gap-2 border-b px-6 py-3">
                <div className="relative min-w-44 flex-1">
                  <SearchIcon className="text-muted-foreground/50 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                  <Input
                    aria-label="Search events"
                    className="h-8 pl-8 text-xs"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search events…"
                    value={searchQuery}
                  />
                </div>

                <Select
                  onValueChange={(value) => setLevelFilter(value as FacilityEventRow["severity"] | "all")}
                  value={levelFilter}
                >
                  <SelectTrigger aria-label="Filter events by severity" className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({levelCounts.total})</SelectItem>
                    <SelectItem value="info">Info ({levelCounts.info})</SelectItem>
                    <SelectItem value="warn">Warn ({levelCounts.warn})</SelectItem>
                    <SelectItem value="error">Error ({levelCounts.error})</SelectItem>
                  </SelectContent>
                </Select>

                {onClearLogs ? (
                  <Button
                    className="text-muted-foreground/70 hover:text-destructive h-8 gap-1.5"
                    onClick={handleDeleteAll}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2Icon className="size-3" />
                    {confirmDeleteAll ? "Confirm?" : "Clear"}
                  </Button>
                ) : null}
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="divide-border/50 divide-y">
                  {filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12">
                      <TerminalIcon className="text-muted-foreground/20 size-6" />
                      <p className="text-muted-foreground/40 text-xs">
                        {searchQuery ? "No matching events" : "No events yet"}
                      </p>
                    </div>
                  ) : null}
                  {filteredLogs.map((event) => (
                    <div className="flex items-start gap-3 px-6 py-2.5 text-xs" key={event.id}>
                      <EventSeverityBadge severity={event.severity} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground/80 font-medium">{event.type}</span>
                          {event.deviceId ? (
                            <span className="bg-muted text-muted-foreground/60 shrink-0 px-1.5 py-0.5 font-mono text-[9px]">
                              {event.deviceId.slice(0, 8)}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-muted-foreground/60 mt-0.5 leading-snug">{event.message}</p>
                      </div>
                      <span className="text-muted-foreground/40 shrink-0 text-[10px]">
                        {new Date(event.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <ProcessList facilityId={facilityId} open={open} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
