import { SearchIcon, TerminalIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "#/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/src/components/ui/dialog";
import { Input } from "#/src/components/ui/input";
import { ScrollArea } from "#/src/components/ui/scroll-area";
import type { FacilityEvent } from "#/src/lib/monitoring/types";
import type { LogEntry } from "../-helpers/types";
import { LogLevelBadge } from "./monitoring-logs-panel";

export interface ContainerLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All raw events from the Observer WS connection. */
  events: FacilityEvent[];
}

const MONITORING_SOURCE_PREFIXES = ["monitoring:", "cctv:", "sensor:"];

/**
 * Dialog that shows monitoring-container and system-level logs.
 * Filtered from the Observer event stream to show only container-related events.
 */
export function ContainerLogsDialog({ open, onOpenChange, events }: ContainerLogsDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LogEntry["level"] | "all">("all");

  const containerLogs = useMemo(() => {
    return events.filter((ev) => {
      // Keep events whose type starts with a known monitoring prefix
      const matchesPrefix = MONITORING_SOURCE_PREFIXES.some((p) => ev.type.startsWith(p));
      if (matchesPrefix) return true;

      // Or events whose parsed data has source === "monitoring-container" or "monitoring-do"
      try {
        const parsed = JSON.parse(ev.data);
        const source = parsed.source;
        if (source === "monitoring-container" || source === "monitoring-do") return true;
      } catch {
        // not JSON
      }
      return false;
    });
  }, [events]);

  const filteredLogs = useMemo(() => {
    let result = containerLogs;

    if (levelFilter !== "all") {
      result = result.filter((ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          return parsed.level === levelFilter;
        } catch {
          return false;
        }
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (ev) =>
          ev.type.toLowerCase().includes(q) ||
          ev.deviceId.toLowerCase().includes(q) ||
          getEventMessage(ev).toLowerCase().includes(q),
      );
    }

    return result;
  }, [containerLogs, levelFilter, searchQuery]);

  const levelCounts = useMemo(() => {
    const counts = { info: 0, warn: 0, error: 0, total: containerLogs.length };
    for (const ev of containerLogs) {
      try {
        const parsed = JSON.parse(ev.data);
        const level = parsed.level;
        if (level === "warn") counts.warn++;
        else if (level === "error") counts.error++;
        else counts.info++;
      } catch {
        counts.info++;
      }
    }
    return counts;
  }, [containerLogs]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-5xl sm:max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-muted-foreground" />
            <DialogTitle>Container Logs</DialogTitle>
            <button
              aria-label="Close"
              className="ml-auto size-6 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          <DialogDescription>Monitoring container events ({containerLogs.length} total)</DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              className="h-8 pl-8 text-xs"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs…"
              value={searchQuery}
            />
          </div>
          <div className="flex gap-1">
            {(["all", "info", "warn", "error"] as const).map((lvl) => (
              <Button
                className="h-7 px-2 text-[11px]"
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                size="sm"
                variant={levelFilter === lvl ? "default" : "outline"}
              >
                {lvl === "all" ? `All (${levelCounts.total})` : `${lvl} (${levelCounts[lvl]})`}
              </Button>
            ))}
          </div>
        </div>

        {/* Log entries */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="flex flex-col gap-0.5 py-2">
            {filteredLogs.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <span className="text-xs text-muted-foreground/50">No matching logs</span>
              </div>
            )}
            {filteredLogs.map((ev) => {
              const level = getEventLevel(ev);
              return (
                <div
                  className="flex items-start gap-2 rounded-none px-2 py-1.5 text-[11px] hover:bg-muted/40 transition-colors"
                  key={ev.id}
                >
                  <span className="shrink-0 text-muted-foreground/50 tabular-nums w-16 text-right font-mono">
                    {new Date(ev.createdAt).toLocaleTimeString()}
                  </span>
                  <LogLevelBadge level={level} />
                  <span className="shrink-0 font-medium text-muted-foreground/80 min-w-[100px]">{ev.type}</span>
                  <span className="text-muted-foreground/70 break-words">{getEventMessage(ev)}</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getEventLevel(ev: FacilityEvent): LogEntry["level"] {
  try {
    const parsed = JSON.parse(ev.data);
    if (typeof parsed.level === "string" && ["info", "warn", "error"].includes(parsed.level)) {
      return parsed.level as LogEntry["level"];
    }
  } catch {
    // fall through
  }
  return "info";
}

function getEventMessage(ev: FacilityEvent): string {
  try {
    const parsed = JSON.parse(ev.data);
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    if (ev.data && ev.data !== "{}") return ev.data;
  }
  // Human-readable fallback
  return ev.type.replace(/:/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
