export type MonitoringSelection =
  | { kind: "event"; eventId: string }
  | { kind: "device"; deviceId: string }
  | { kind: "zone"; zoneId: string }
  | null;

export function isEventSelected(selection: MonitoringSelection, eventId: string): boolean {
  return selection?.kind === "event" && selection.eventId === eventId;
}

export function isDeviceSelected(selection: MonitoringSelection, deviceId: string | null): boolean {
  return Boolean(deviceId && selection?.kind === "device" && selection.deviceId === deviceId);
}

export function selectedDeviceId(selection: MonitoringSelection): string | null {
  return selection?.kind === "device" ? selection.deviceId : null;
}

export function selectedZoneId(selection: MonitoringSelection): string | null {
  return selection?.kind === "zone" ? selection.zoneId : null;
}
