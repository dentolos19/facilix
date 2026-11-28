import { useEffect, useRef } from "react";

import { ScrollArea } from "#/components/ui/scroll-area";
import type { FacilityEventView } from "#/lib/functions/events";
import { isDeviceSelected, isEventSelected, type MonitoringSelection } from "#/lib/monitoring/selection";

/** Time-ordered feed of facility events with event/device selection semantics. */
export function GlobalEventsPanel({
  events,
  selection,
  onSelectEvent,
  onSelectDevice,
}: {
  events: FacilityEventView[];
  selection: MonitoringSelection;
  onSelectEvent: (eventId: string) => void;
  onSelectDevice: (deviceId: string) => void;
}) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );

  function scheduleEventSelection(eventId: string) {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      onSelectEvent(eventId);
      clickTimer.current = null;
    }, 180);
  }

  function selectDevice(event: FacilityEventView) {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (event.deviceId) onSelectDevice(event.deviceId);
    else onSelectEvent(event.id);
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-4">
        <h3 className="shrink-0 font-heading text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Global Events
        </h3>

        {events.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-[11px] text-muted-foreground/50">No events yet</span>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {events.slice(0, 200).map((event) => {
            const eventSelected = isEventSelected(selection, event.id);
            const deviceSelected = isDeviceSelected(selection, event.deviceId);
            return (
              <button
                aria-label={`${event.deviceName}: ${event.message}`}
                aria-pressed={eventSelected || deviceSelected}
                className={`flex flex-col gap-0.5 rounded-none border-l-2 px-2 py-1.5 text-left text-[11px] leading-relaxed transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none ${
                  eventSelected
                    ? "border-foreground bg-accent/40"
                    : deviceSelected
                      ? "border-muted-foreground/50 bg-muted"
                      : "border-transparent"
                }`}
                key={event.id}
                onClick={(clickEvent) => {
                  if (clickEvent.detail === 1) scheduleEventSelection(event.id);
                }}
                onDoubleClick={() => selectDevice(event)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter") {
                    keyEvent.preventDefault();
                    if (clickTimer.current) clearTimeout(clickTimer.current);
                    onSelectEvent(event.id);
                  }
                }}
                type="button"
              >
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 font-medium text-foreground/80">{event.deviceName}</span>
                  <EventSeverityBadge severity={event.severity} />
                  {event.occurrenceCount > 1 && (
                    <span className="bg-foreground/7 px-1 font-mono text-[9px] text-foreground/65">
                      {event.occurrenceCount} observations
                    </span>
                  )}
                  {event.attachments.length > 0 && (
                    <span className="font-mono text-[9px] text-muted-foreground/50">
                      {event.attachments.length} {event.attachments.length === 1 ? "attachment" : "attachments"}
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground/70">{event.message}</span>
                <span className="text-muted-foreground/40">
                  {event.occurrenceCount > 1 ? "Last observed " : ""}
                  {new Date(event.lastSeen).toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

/** Small coloured badge for log severity. */
export function EventSeverityBadge({ severity }: { severity: FacilityEventView["severity"] }) {
  const colors: Record<FacilityEventView["severity"], string> = {
    info: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    error: "bg-red-500/15 text-red-600 dark:text-red-400",
  };
  return (
    <span className={`rounded-none px-1 py-0.5 text-[10px] font-medium uppercase ${colors[severity]}`}>{severity}</span>
  );
}
