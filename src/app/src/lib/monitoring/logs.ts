/**
 * Log policy
 *
 * The platform records every observation as a *log*. Most logs are transient
 * and live only in the Observer DO for container diagnostics. A subset of
 * logs are important enough to become *events*: persisted to D1, shown in the
 * Global Events panel, and eligible for user notifications.
 *
 * Users can opt extra (non-important) log types into events per facility via
 * Facility Settings > Global Events.
 */

export type LogSeverity = "info" | "warn" | "error";

export interface LogTypeDescriptor {
  type: string;
  label: string;
  category: "monitoring" | "cctv" | "sensor";
  description: string;
  /** Whether this log is important by default and cannot be disabled. */
  important: boolean;
  /** Whether this log is high-volume and should warn the user before enabling. */
  highVolume?: boolean;
}

export const LOG_TYPES: LogTypeDescriptor[] = [
  {
    type: "monitoring:started",
    label: "Monitoring started",
    category: "monitoring",
    description: "Monitoring container started for this facility.",
    important: true,
    highVolume: false,
  },
  {
    type: "monitoring:stopped",
    label: "Monitoring stopped",
    category: "monitoring",
    description: "Monitoring container stopped for this facility.",
    important: true,
    highVolume: false,
  },
  {
    type: "monitoring:heartbeat",
    label: "Monitoring heartbeat",
    category: "monitoring",
    description: "Periodic keep-alive from the monitoring container.",
    important: false,
    highVolume: true,
  },
  {
    type: "cctv:anomaly",
    label: "Anomaly detected",
    category: "cctv",
    description: "CCTV detected an object class flagged as anomalous.",
    important: true,
    highVolume: false,
  },
  {
    type: "cctv:segment:stored",
    label: "Recording stored",
    category: "cctv",
    description: "A CCTV segment was uploaded and stored.",
    important: false,
    highVolume: true,
  },
  {
    type: "cctv:segment:analyzed",
    label: "Recording analyzed",
    category: "cctv",
    description: "A stored CCTV segment was summarized and analyzed.",
    important: false,
    highVolume: true,
  },
  {
    type: "cctv:detection:alert",
    label: "Detection alert",
    category: "cctv",
    description: "A detection plugin threshold was exceeded.",
    important: true,
    highVolume: false,
  },
  {
    type: "sensor:reading",
    label: "Sensor reading",
    category: "sensor",
    description: "Periodic sensor measurement.",
    important: false,
    highVolume: true,
  },
  {
    type: "sensor:alert",
    label: "Sensor alert",
    category: "sensor",
    description: "Sensor reading crossed a configured threshold.",
    important: true,
    highVolume: false,
  },
];

const LOG_TYPE_BY_TYPE = new Map(LOG_TYPES.map((lt) => [lt.type, lt]));
const IMPORTANT_LOG_TYPES = new Set(LOG_TYPES.filter((lt) => lt.important).map((lt) => lt.type));

/** Per-facility settings for which non-important logs become events. */
export interface FacilitySettings {
  globalEvents: {
    /** Log types the user explicitly wants in Global Events. */
    enabledLogTypes: string[];
  };
}

export const DEFAULT_FACILITY_SETTINGS: FacilitySettings = {
  globalEvents: {
    enabledLogTypes: [],
  },
};

/**
 * Returns true if a log is important enough to be an event regardless of
 * user preferences. Warnings and errors are always events.
 */
export function isImportantLog(type: string, severity: LogSeverity): boolean {
  if (severity === "warn" || severity === "error") return true;
  return IMPORTANT_LOG_TYPES.has(type);
}

/**
 * Returns true if a log should be persisted to D1 / shown in Global Events.
 * Important logs are always included. Non-important logs are included only
 * when the facility settings opt the specific log type in.
 */
export function shouldShowInGlobalEvents(type: string, severity: LogSeverity, settings: FacilitySettings): boolean {
  if (isImportantLog(type, severity)) return true;
  return settings.globalEvents.enabledLogTypes.includes(type);
}

/** Lookup a known log descriptor by type. */
export function getLogDescriptor(type: string): LogTypeDescriptor | undefined {
  return LOG_TYPE_BY_TYPE.get(type);
}

/** Group known log types by category, preserving declaration order. */
export function logTypesByCategory(): Record<LogTypeDescriptor["category"], LogTypeDescriptor[]> {
  const result: Record<LogTypeDescriptor["category"], LogTypeDescriptor[]> = {
    monitoring: [],
    cctv: [],
    sensor: [],
  };
  for (const lt of LOG_TYPES) {
    result[lt.category].push(lt);
  }
  return result;
}

/** Normalize partial settings into a complete shape with defaults. */
export function normalizeFacilitySettings(partial?: Partial<FacilitySettings>): FacilitySettings {
  return {
    globalEvents: {
      enabledLogTypes: partial?.globalEvents?.enabledLogTypes ?? DEFAULT_FACILITY_SETTINGS.globalEvents.enabledLogTypes,
    },
  };
}
