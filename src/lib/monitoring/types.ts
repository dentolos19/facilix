/** Current state of a Monitor container. */
export type MonitorStatus = "starting" | "running" | "stopping" | "stopped" | "error";

/**
 * A single event that flows through the Observer DO.
 * This mirrors the `observations` table schema.
 */
export interface FacilityEvent {
  id: string;
  deviceId: string;
  type: string; // e.g. "monitor:started", "monitor:stopped", "device:motion", "device:sensor"
  data: string; // arbitrary JSON payload
  createdAt: string; // ISO-8601
}

/**
 * A single facility's monitor status entry (used for batch queries).
 */
export interface FacilityStatusEntry {
  id: string;
  status: MonitorStatus;
}

/**
 * Messages sent from the Observer DO to all connected WebSocket clients.
 */
export type ObserverSocketMessage =
  | { type: "snapshot"; events: FacilityEvent[] }
  | { type: "event"; event: FacilityEvent }
  | { type: "status"; status: MonitorStatus };
