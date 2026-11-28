import { AlertTriangleIcon, ImageIcon, InfoIcon } from "lucide-react";

import type { UiEventList } from "#/lib/chat/ui";

const SEVERITY_STYLES: Record<
  string,
  { border: string; label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  error: { border: "border-l-red-500", label: "Error", icon: AlertTriangleIcon },
  warn: { border: "border-l-amber-500", label: "Warning", icon: AlertTriangleIcon },
  info: { border: "border-l-green-500", label: "Info", icon: InfoIcon },
};

export function EventListCard({ data }: { data: UiEventList }) {
  if (data.events.length === 0) {
    return (
      <div className="my-2 flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/10 p-6 text-center">
        <InfoIcon className="size-6 text-muted-foreground/40" />
        <p className="text-[11px] text-muted-foreground/60">No events to display</p>
      </div>
    );
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border">
      <div className="flex flex-col divide-y divide-border">
        {data.events.slice(0, 15).map((event) => {
          const style = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info;
          const Icon = style.icon;
          return (
            <div className={`border-l-2 py-2 pr-2 pl-3 ${style.border}`} key={event.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0" />
                    <span className="text-xs leading-tight font-medium">{event.message}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/60">
                    {event.deviceName && <span>{event.deviceName}</span>}
                    {event.zoneName && <span>{event.zoneName}</span>}
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {event.hasMedia && (
                    <span
                      className="flex items-center gap-0.5 text-muted-foreground/50"
                      title={`${event.mediaCount} attachment(s)`}
                    >
                      <ImageIcon className="size-3" />
                      <span className="text-[10px]">{event.mediaCount}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {data.count > 15 && (
        <div className="border-t border-border/50 bg-muted/20 px-3 py-1.5 text-center">
          <span className="text-[10px] text-muted-foreground/50">{data.count} events total</span>
        </div>
      )}
    </div>
  );
}
