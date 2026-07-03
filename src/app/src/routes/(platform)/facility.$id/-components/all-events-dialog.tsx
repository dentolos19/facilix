import { SearchIcon, TerminalIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { ScrollArea } from "#/components/ui/scroll-area";
import type { FacilityEventRow } from "#/lib/functions/events";

import { EventSeverityBadge } from "./global-events-panel";

export interface AllEventsDialogProps {
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
export function AllEventsDialog({ open, onOpenChange, events, onClearLogs }: AllEventsDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<FacilityEventRow["severity"] | "all">("all");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  // Reset confirmation state when dialog opens
  useEffect(() => {
    if (open) setConfirmDeleteAll(false);
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
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-border border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4" />
            All events
          </DialogTitle>
          <DialogDescription>Complete event history for this facility</DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="border-border flex flex-wrap items-center gap-2 border-b px-6 py-3">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="text-muted-foreground/50 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              aria-label="Search events"
              className="h-8 pl-8 text-xs"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events…"
              value={searchQuery}
            />
          </div>

          {/* Level filter */}
          <div className="flex gap-1">
            {(["all", "info", "warn", "error"] as const).map((level) => (
              <button
                className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  levelFilter === level
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                key={level}
                onClick={() => setLevelFilter(level)}
                type="button"
              >
                {level === "all"
                  ? `All (${levelCounts.total})`
                  : `${level.charAt(0).toUpperCase() + level.slice(1)} (${levelCounts[level]})`}
              </button>
            ))}
          </div>

          {onClearLogs && (
            <Button
              className="text-muted-foreground/70 hover:text-destructive h-8 gap-1.5"
              onClick={handleDeleteAll}
              size="sm"
              variant="ghost"
            >
              <Trash2Icon className="size-3" />
              {confirmDeleteAll ? "Confirm?" : "Clear"}
            </Button>
          )}
        </div>

        {/* Log entries */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="divide-border/50 divide-y">
            {filteredLogs.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12">
                <TerminalIcon className="text-muted-foreground/20 size-6" />
                <p className="text-muted-foreground/40 text-xs">
                  {searchQuery ? "No matching events" : "No events yet"}
                </p>
              </div>
            )}
            {filteredLogs.map((ev) => {
              return (
                <div className="flex items-start gap-3 px-6 py-2.5 text-xs" key={ev.id}>
                  <EventSeverityBadge severity={ev.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground/80 font-medium">{ev.type}</span>
                      {ev.deviceId && (
                        <span className="bg-muted text-muted-foreground/60 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px]">
                          {ev.deviceId.slice(0, 8)}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground/60 mt-0.5 leading-snug">{ev.message}</p>
                  </div>
                  <span className="text-muted-foreground/40 shrink-0 text-[10px]">
                    {new Date(ev.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
