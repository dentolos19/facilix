import { describe, expect, test } from "bun:test";

import { isDeviceSelected, isEventSelected, selectedDeviceId, type MonitoringSelection } from "./selection";

describe("monitoring selection", () => {
  test("event selection targets exactly one event", () => {
    const selection: MonitoringSelection = { kind: "event", eventId: "event-a" };
    expect(isEventSelected(selection, "event-a")).toBe(true);
    expect(isEventSelected(selection, "event-b")).toBe(false);
    expect(isDeviceSelected(selection, "device-a")).toBe(false);
    expect(selectedDeviceId(selection)).toBeNull();
  });

  test("device selection targets every row from that device", () => {
    const selection: MonitoringSelection = { kind: "device", deviceId: "device-a" };
    expect(isDeviceSelected(selection, "device-a")).toBe(true);
    expect(isDeviceSelected(selection, "device-b")).toBe(false);
    expect(isEventSelected(selection, "event-a")).toBe(false);
    expect(selectedDeviceId(selection)).toBe("device-a");
  });
});
