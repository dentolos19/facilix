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
        <h3 className="font-heading text-muted-foreground shrink-0 text-xs font-medium tracking-wider uppercase">
          Global Events
        </h3>

        {events.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <span className="text-muted-foreground/50 text-[11px]">No events yet</span>
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
                className={`hover:bg-muted focus-visible:ring-ring flex flex-col gap-0.5 rounded-none border-l-2 px-2 py-1.5 text-left text-[11px] leading-relaxed transition-colors focus-visible:ring-1 focus-visible:outline-none ${
                  eventSelected
                    ? "bg-accent/40 border-foreground"
                    : deviceSelected
                      ? "bg-muted border-muted-foreground/50"
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
                  <span className="text-foreground/80 shrink-0 font-medium">{event.deviceName}</span>
                  <EventSeverityBadge severity={event.severity} />
                  {event.attachments.length > 0 && (
                    <span className="text-muted-foreground/50 font-mono text-[9px]">
                      {event.attachments.length} attachments
                    </span>
                  )}
                </div>
                <span className="text-muted-foreground/70">{event.message}</span>
                <span className="text-muted-foreground/40">{new Date(event.createdAt).toLocaleString()}</span>
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
