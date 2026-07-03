import type { FacilityEventView } from "#/lib/functions/events";
import type { MonitoringSelection } from "#/lib/monitoring/selection";

import type { PlacedItem } from "../-helpers/types";
import { DeviceDetailsPanel } from "./device-details-panel";
import { EventDetailsPanel } from "./event-details-panel";

export function MonitoringDetailsPanel({
  selection,
  events,
  devices,
  facilityId,
  onSelectDevice,
}: {
  selection: MonitoringSelection;
  events: FacilityEventView[];
  devices: PlacedItem[];
  facilityId: string;
  onSelectDevice: (deviceId: string) => void;
}) {
  if (selection?.kind === "event") {
    const event = events.find((item) => item.id === selection.eventId);
    if (event) {
      const device = event.deviceId ? devices.find((item) => item.id === event.deviceId) : null;
      return <EventDetailsPanel device={device} event={event} onSelectDevice={onSelectDevice} />;
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

  return (
    <div className="text-muted-foreground/50 flex h-full items-center justify-center px-6 text-center text-[11px]">
      Select an event to inspect its evidence, or select a device to view its operational details.
    </div>
  );
}
