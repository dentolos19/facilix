import type { FacilityEventView } from "#/lib/functions/events";
import type { MonitoringSelection } from "#/lib/monitoring/selection";

import type { PlacedItem } from "../-helpers/types";
import { DeviceDetailsPanel } from "./device-details-panel";
import { EventDetailsPanel } from "./event-details-panel";
import { ZoneDetailsPanel } from "./zone-details-panel";

export function MonitoringDetailsPanel({
  selection,
  events,
  devices,
  facilityId,
}: {
  selection: MonitoringSelection;
  events: FacilityEventView[];
  devices: PlacedItem[];
  facilityId: string;
}) {
  if (selection?.kind === "event") {
    const event = events.find((item) => item.id === selection.eventId);
    if (event) {
      return <EventDetailsPanel event={event} />;
    }
  }

  if (selection?.kind === "device") {
    return (
      <DeviceDetailsPanel
        events={events}
        facilityId={facilityId}
        selectedDevice={devices.find((item) => item.id === selection.deviceId) ?? null}
        selectedDeviceId={selection.deviceId}
      />
    );
  }

  if (selection?.kind === "zone") {
    return (
      <ZoneDetailsPanel
        devices={devices}
        selectedZone={devices.find((item) => item.id === selection.zoneId && item.type === "Zone") ?? null}
      />
    );
  }

  return (
    <div className="text-muted-foreground/50 flex h-full items-center justify-center px-6 text-center text-[11px]">
      Select an event to inspect its evidence, or select a device or zone to view its operational details.
    </div>
  );
}
