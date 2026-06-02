/** Current state of a Monitoring container. */
export type MonitoringStatus = "starting" | "running" | "stopping" | "stopped" | "error";

/**
 * A single event that flows through the Observer DO.
 * This mirrors the `observations` table schema.
 */
export interface FacilityEvent {
  id: string;
  deviceId: string;
  type: string; // e.g. "monitoring:started", "monitoring:stopped", "device:motion", "device:sensor"
  data: string; // arbitrary JSON payload
  createdAt: string; // ISO-8601
}

/**
 * A single facility's monitoring status entry (used for batch queries).
 */
export interface FacilityStatusEntry {
  id: string;
  status: MonitoringStatus;
}

/**
 * Messages sent from the Observer DO to all connected WebSocket clients.
 */
export type ObserverSocketMessage =
  | { type: "snapshot"; events: FacilityEvent[] }
  | { type: "event"; event: FacilityEvent }
  | { type: "status"; status: MonitoringStatus };
