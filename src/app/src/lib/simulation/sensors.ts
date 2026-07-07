/**
 * Sensor simulation helpers.
 *
 * Discovers available devices and readings from the sensor simulator API
 * and normalises them for use in the frontend.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulationSensorDevice {
  deviceId: string;
  sensorType: string;
  label: string;
  status: "ok" | "degraded" | "offline" | "error";
  enabled: boolean;
  batteryPct: number;
  signalRssiDbm: number;
  intervalSeconds: number;
  measurementRange?: {
    min: number;
    max: number;
    unit: string;
  };
}

export interface NormalizedReading {
  deviceId: string;
  sensorType: string;
  timestamp: string;
  sequence: number;
  status: "ok" | "degraded" | "offline" | "error";
  batteryPct: number;
  signalRssiDbm: number;
  value: number;
  unit: string;
  secondaryValue?: number | null;
  secondaryUnit?: string | null;
  raw: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Configuration (Vite client env vars – local dev only)
// ---------------------------------------------------------------------------

function getApiBase(): string {
  return import.meta.env?.VITE_SIMULATOR_API_URL ?? "http://localhost:3002";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the list of available simulation sensor devices.
 * Returns an empty array if the simulator is unreachable.
 */
export async function fetchSimulationSensors(): Promise<SimulationSensorDevice[]> {
  try {
    const res = await fetch(`${getApiBase()}/sensors`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { sensors: SimulationSensorDevice[] };
    return data.sensors;
  } catch {
    return [];
  }
}

/**
 * Fetch details for a single simulation sensor device.
 */
export async function fetchSimulationSensor(deviceId: string): Promise<SimulationSensorDevice | null> {
  try {
    const res = await fetch(`${getApiBase()}/sensors/${encodeURIComponent(deviceId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SimulationSensorDevice;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest reading for a simulation sensor device.
 */
export async function fetchSimulationLatestReading(deviceId: string): Promise<NormalizedReading | null> {
  try {
    const res = await fetch(`${getApiBase()}/readings/latest?device_id=${encodeURIComponent(deviceId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { readings: Record<string, unknown>[] };
    const found = data.readings.find((r: Record<string, unknown>) => String(r.deviceId ?? "") === deviceId);
    if (!found) return null;
    return normalizeReading(found);
  } catch {
    return null;
  }
}

/**
 * Fetch reading history for a simulation sensor device.
 */
export async function fetchSimulationHistory(deviceId: string, limit = 50): Promise<NormalizedReading[]> {
  try {
    const res = await fetch(`${getApiBase()}/readings?device_id=${encodeURIComponent(deviceId)}&limit=${limit}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { readings: Record<string, unknown>[] };
    return (data.readings ?? []).map(normalizeReading);
  } catch {
    return [];
  }
}

/**
 * Trigger a single immediate reading for a simulation sensor device.
 */
export async function triggerSimulationReading(deviceId: string): Promise<NormalizedReading | null> {
  try {
    const res = await fetch(`${getApiBase()}/sensors/${encodeURIComponent(deviceId)}/read`, {
      method: "POST",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return normalizeReading(data);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function normalizeReading(raw: Record<string, unknown>): NormalizedReading {
  const values = (raw.values as Record<string, { value: number; unit: string }>) ?? {};
  const sensorType = String(raw.sensorType ?? "");

  // Extract primary value from the values map
  let value = 0;
  let unit = "";
  let secondaryValue: number | null = null;
  let secondaryUnit: string | null = null;

  const primaryEntry = values[sensorType];
  if (primaryEntry) {
    value = primaryEntry.value;
    unit = primaryEntry.unit;
  }

  // Extract secondary value (e.g. occupancy for motion)
  const secondaryEntry = values.occupancy ?? values.value;
  if (secondaryEntry && secondaryEntry !== primaryEntry) {
    secondaryValue = secondaryEntry.value;
    secondaryUnit = secondaryEntry.unit;
  }

  return {
    deviceId: String(raw.deviceId ?? ""),
    sensorType,
    timestamp: String(raw.timestamp ?? ""),
    sequence: Number(raw.sequence ?? 0),
    status: (raw.status as NormalizedReading["status"]) ?? "ok",
    batteryPct: Number(raw.batteryPct ?? 0),
    signalRssiDbm: Number(raw.signalRssiDbm ?? 0),
    value,
    unit,
    secondaryValue,
    secondaryUnit,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Static fallback sensor definitions
// ---------------------------------------------------------------------------

export const FALLBACK_SIMULATION_SENSORS: SimulationSensorDevice[] = [
  {
    deviceId: "sensor-temp-001",
    sensorType: "temperature",
    label: "Temperature Sensor",
    status: "ok",
    enabled: true,
    batteryPct: 87,
    signalRssiDbm: -55,
    intervalSeconds: 5,
    measurementRange: { min: 18, max: 30, unit: "°C" },
  },
  {
    deviceId: "sensor-humidity-001",
    sensorType: "humidity",
    label: "Humidity Sensor",
    status: "ok",
    enabled: true,
    batteryPct: 92,
    signalRssiDbm: -61,
    intervalSeconds: 5,
    measurementRange: { min: 30, max: 70, unit: "%RH" },
  },
  {
    deviceId: "sensor-pressure-001",
    sensorType: "pressure",
    label: "Pressure Sensor",
    status: "ok",
    enabled: true,
    batteryPct: 78,
    signalRssiDbm: -48,
    intervalSeconds: 5,
    measurementRange: { min: 980, max: 1040, unit: "hPa" },
  },
  {
    deviceId: "sensor-light-001",
    sensorType: "light",
    label: "Light Sensor",
    status: "ok",
    enabled: true,
    batteryPct: 95,
    signalRssiDbm: -70,
    intervalSeconds: 5,
    measurementRange: { min: 0, max: 1200, unit: "lux" },
  },
  {
    deviceId: "sensor-motion-001",
    sensorType: "motion",
    label: "Motion Detector",
    status: "ok",
    enabled: true,
    batteryPct: 63,
    signalRssiDbm: -42,
    intervalSeconds: 5,
    measurementRange: { min: 0, max: 1, unit: "detected" },
  },
  {
    deviceId: "sensor-air-001",
    sensorType: "air_quality",
    label: "Air Quality Monitor",
    status: "ok",
    enabled: true,
    batteryPct: 81,
    signalRssiDbm: -55,
    intervalSeconds: 5,
    measurementRange: { min: 350, max: 1200, unit: "ppm" },
  },
  {
    deviceId: "sensor-leak-001",
    sensorType: "leak",
    label: "Leak Detector",
    status: "ok",
    enabled: true,
    batteryPct: 100,
    signalRssiDbm: -65,
    intervalSeconds: 5,
    measurementRange: { min: 0, max: 1, unit: "leak" },
  },
  {
    deviceId: "sensor-vibration-001",
    sensorType: "vibration",
    label: "Vibration Sensor",
    status: "ok",
    enabled: true,
    batteryPct: 74,
    signalRssiDbm: -59,
    intervalSeconds: 5,
    measurementRange: { min: 0, max: 25, unit: "mm/s" },
  },
  {
    deviceId: "sensor-door-001",
    sensorType: "door_contact",
    label: "Door Contact",
    status: "ok",
    enabled: true,
    batteryPct: 88,
    signalRssiDbm: -50,
    intervalSeconds: 5,
    measurementRange: { min: 0, max: 1, unit: "open" },
  },
  {
    deviceId: "sensor-battery-001",
    sensorType: "battery",
    label: "Battery Monitor",
    status: "ok",
    enabled: true,
    batteryPct: 55,
    signalRssiDbm: -72,
    intervalSeconds: 5,
    measurementRange: { min: 0, max: 100, unit: "%" },
  },
];
