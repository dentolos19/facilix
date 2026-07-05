import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, desc, eq, gte } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { requireFacilityAccess } from "#/lib/functions/access";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AnalyticsTimeRange = "24h" | "7d" | "30d";
export type InsightSeverity = "positive" | "info" | "warn" | "critical";
export type OverallStatus = "normal" | "attention" | "critical";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  evidence: string[];
  recommendedAction?: string;
}

export interface DeviceTypeCount {
  type: string;
  count: number;
}

export interface DeviceStatusCount {
  status: string;
  count: number;
}

export interface EventBucket {
  time: string;
  info: number;
  warn: number;
  error: number;
}

export interface RecordingByDevice {
  deviceId: string;
  deviceName: string;
  count: number;
  durationSec: number;
}

export interface RecentAlert {
  id: string;
  severity: string;
  type: string;
  message: string;
  deviceId: string | null;
  deviceName: string | null;
  createdAt: string;
}

export interface SensorMetric {
  deviceId: string;
  deviceName: string;
  sensorType: string;
  value: number;
  unit: string;
  status: string;
  batteryPct: number | null;
  signalRssiDbm: number | null;
  timestamp: string;
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  zoneName: string | null;
}

export interface FacilityAnalytics {
  facilityId: string;
  facilityName: string;
  generatedAt: string;
  range: AnalyticsTimeRange;
  overallStatus: OverallStatus;
  healthScore: number;

  zoneCount: number;
  totalDevices: number;
  onlineDevices: number;
  devicesByType: DeviceTypeCount[];
  devicesByStatus: DeviceStatusCount[];

  eventCounts: { severity: string; count: number }[];
  eventTypeCounts: { type: string; count: number }[];
  eventBuckets: EventBucket[];
  totalEventsInRange: number;
  anomalyCount: number;

  sensorMetrics: SensorMetric[];
  sensorStatusCounts: { status: string; count: number }[];
  totalSensorReadings: number;

  recordingCount: number;
  totalRecordingDurationSec: number;
  recordingsByDevice: RecordingByDevice[];

  recentAlerts: RecentAlert[];
  devices: DeviceInfo[];

  insights: Insight[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSinceDate(range: AnalyticsTimeRange): Date {
  const now = new Date();
  const ms = range === "24h" ? 86_400_000 : range === "7d" ? 604_800_000 : 2_592_000_000;
  return new Date(now.getTime() - ms);
}

function bucketEvents(events: Array<{ severity: string; createdAt: Date }>, range: AnalyticsTimeRange): EventBucket[] {
  const map = new Map<string, { info: number; warn: number; error: number }>();

  for (const event of events) {
    const date = event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt);
    const key =
      range === "24h"
        ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:00`
        : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

    if (!map.has(key)) {
      map.set(key, { info: 0, warn: 0, error: 0 });
    }
    const b = map.get(key)!;
    if (event.severity === "error") b.error++;
    else if (event.severity === "warn") b.warn++;
    else b.info++;
  }

  return Array.from(map.entries())
    .map(([time, counts]) => ({ time, ...counts }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function countBy(items: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1;
  }
  return counts;
}

function generateInsights(
  devices: DeviceInfo[],
  events: Array<{ severity: string; type: string; message: string; deviceId: string | null }>,
  sensorMetrics: SensorMetric[],
  anomalyCount: number,
  range: AnalyticsTimeRange,
): Insight[] {
  const insights: Insight[] = [];
  const rangeLabel = range === "24h" ? "last 24 hours" : range === "7d" ? "last 7 days" : "last 30 days";

  // Devices in error state
  const errorDevices = devices.filter((d) => d.status === "error");
  if (errorDevices.length > 0) {
    insights.push({
      id: "error-devices",
      severity: "critical",
      title: "Devices in Error State",
      description: `${errorDevices.length} device(s) are in error state and require immediate attention.`,
      evidence: errorDevices.map((d) => d.name),
      recommendedAction: "Check device connectivity and configuration. Restart the device or monitoring container.",
    });
  }

  // Devices offline or stopped
  const offlineDevices = devices.filter((d) => d.status === "offline" || d.status === "stopped");
  if (offlineDevices.length > 0 && errorDevices.length === 0) {
    insights.push({
      id: "offline-devices",
      severity: "warn",
      title: "Offline Devices Detected",
      description: `${offlineDevices.length} device(s) are currently offline.`,
      evidence: offlineDevices.map((d) => d.name),
      recommendedAction: "Verify network connectivity and power status for these devices.",
    });
  }

  // Critical sensor readings
  const errorSensors = sensorMetrics.filter((s) => s.status === "error");
  if (errorSensors.length > 0) {
    insights.push({
      id: "sensor-alerts",
      severity: "critical",
      title: "Critical Sensor Readings",
      description: `${errorSensors.length} sensor(s) are reporting critical values in the ${rangeLabel}.`,
      evidence: errorSensors.map((s) => `${s.deviceName}: ${s.value} ${s.unit}`),
      recommendedAction: "Inspect sensor devices and environmental conditions in affected zones immediately.",
    });
  }

  // Sensor warnings
  const warnSensors = sensorMetrics.filter((s) => s.status === "warn");
  if (warnSensors.length > 0) {
    insights.push({
      id: "sensor-warnings",
      severity: "warn",
      title: "Sensor Readings Above Threshold",
      description: `${warnSensors.length} sensor(s) are reporting values above warning thresholds.`,
      evidence: warnSensors.map((s) => `${s.deviceName}: ${s.value} ${s.unit}`),
      recommendedAction:
        "Monitor these sensors closely. Consider adjusting thresholds or investigating environmental factors.",
    });
  }

  // Low battery
  const lowBattery = sensorMetrics.filter((s) => s.batteryPct !== null && s.batteryPct < 20);
  if (lowBattery.length > 0) {
    insights.push({
      id: "low-battery",
      severity: "warn",
      title: "Low Battery on Sensors",
      description: `${lowBattery.length} sensor(s) have battery levels below 20%.`,
      evidence: lowBattery.map((s) => `${s.deviceName}: ${s.batteryPct}%`),
      recommendedAction: "Schedule battery replacement to prevent data gaps.",
    });
  }

  // CCTV anomalies
  if (anomalyCount > 0) {
    insights.push({
      id: "cctv-anomalies",
      severity: anomalyCount > 10 ? "warn" : anomalyCount > 3 ? "info" : "positive",
      title: "CCTV Anomalies",
      description: `${anomalyCount} CCTV anomaly event(s) detected in the ${rangeLabel}.`,
      evidence: [`${anomalyCount} anomaly event(s)`],
      recommendedAction:
        anomalyCount > 10
          ? "Review CCTV footage and anomaly details for patterns requiring attention."
          : "No immediate action needed. Continue monitoring.",
    });
  }

  // High error volume
  const criticalEvents = events.filter((e) => e.severity === "error");
  if (criticalEvents.length > 10) {
    insights.push({
      id: "high-error-volume",
      severity: "critical",
      title: "High Volume of Error Events",
      description: `${criticalEvents.length} error-level events recorded in the ${rangeLabel}, indicating potential systemic issues.`,
      evidence: criticalEvents.slice(0, 5).map((e) => e.message),
      recommendedAction: "Investigate the root cause of recurring errors. Check logs and device connectivity.",
    });
  }

  // Positive / all-clear
  if (insights.length === 0) {
    const word = devices.length === 1 ? "device is" : "devices are";
    insights.push({
      id: "all-good",
      severity: "positive",
      title: "Facility Operations Normal",
      description: `All ${devices.length} ${word} operating normally. No alerts or warnings in the ${rangeLabel}.`,
      evidence: [`${devices.length} device(s) online`, `${anomalyCount} anomaly event(s)`],
    });
  }

  return insights;
}

function calculateHealthScore(
  devices: DeviceInfo[],
  sensorMetrics: SensorMetric[],
  events: Array<{ severity: string }>,
): number {
  if (devices.length === 0) return 100;

  let score = 100;

  const errorDeviceCount = devices.filter((d) => d.status === "error").length;
  const offlineCount = devices.filter((d) => d.status === "offline" || d.status === "stopped").length;
  const errorSensorCount = sensorMetrics.filter((s) => s.status === "error").length;
  const warnSensorCount = sensorMetrics.filter((s) => s.status === "warn").length;
  const errorEventCount = events.filter((e) => e.severity === "error").length;

  score -= errorDeviceCount * 20;
  score -= offlineCount * 10;
  score -= errorSensorCount * 15;
  score -= warnSensorCount * 5;
  score -= Math.min(errorEventCount * 2, 20);

  return Math.max(0, Math.min(100, score));
}

// ─── Server function ──────────────────────────────────────────────────────

export const getFacilityAnalytics = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; range?: AnalyticsTimeRange }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return { facilityId: data.facilityId, range: data.range ?? "24h" };
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);
    const { facilityId, range } = data;
    const since = getSinceDate(range);

    // ── 1. Facility metadata ────────────────────────────────────────────
    const [facility] = await db.select().from(schema.facility).where(eq(schema.facility.id, facilityId)).limit(1);

    if (!facility) {
      throw new Error(`Facility not found: ${facilityId}`);
    }

    // ── 2. Zones ────────────────────────────────────────────────────────
    const zones = await db
      .select({ id: schema.facilityZone.id, name: schema.facilityZone.name })
      .from(schema.facilityZone)
      .where(eq(schema.facilityZone.facilityId, facilityId));

    const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

    // ── 3. Devices ──────────────────────────────────────────────────────
    const deviceRows = await db
      .select()
      .from(schema.facilityDevice)
      .where(eq(schema.facilityDevice.facilityId, facilityId));

    const devices: DeviceInfo[] = deviceRows.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      status: d.status,
      zoneName: d.zoneId ? (zoneMap.get(d.zoneId) ?? null) : null,
    }));

    const deviceNameMap = new Map(deviceRows.map((d) => [d.id, d.name]));

    const totalDevices = deviceRows.length;
    const onlineDevices = deviceRows.filter((d) => d.status === "online" || d.status === "running").length;

    const deviceTypeCounts = countBy(deviceRows.map((d) => d.type));
    const deviceStatusCounts = countBy(deviceRows.map((d) => d.status));

    // ── 4. Events in time range (limited for performance) ───────────────
    const eventRows = await db
      .select({
        severity: schema.facilityEvent.severity,
        type: schema.facilityEvent.type,
        message: schema.facilityEvent.message,
        deviceId: schema.facilityEvent.deviceId,
        createdAt: schema.facilityEvent.createdAt,
      })
      .from(schema.facilityEvent)
      .where(and(eq(schema.facilityEvent.facilityId, facilityId), gte(schema.facilityEvent.createdAt, since)))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(1000);

    const eventSeverityCounts = countBy(eventRows.map((e) => e.severity));
    const eventTypeCountResults = countBy(eventRows.map((e) => e.type));
    const eventBuckets = bucketEvents(eventRows, range);
    const totalEventsInRange = eventRows.length;
    const anomalyCount = eventTypeCountResults["cctv:anomaly"] ?? 0;

    // ── 5. Sensor readings ──────────────────────────────────────────────
    const sensorReadings = await db
      .select()
      .from(schema.sensorReading)
      .where(eq(schema.sensorReading.facilityId, facilityId))
      .orderBy(desc(schema.sensorReading.timestamp))
      .limit(1000);

    // Latest per device
    const latestSensorMap = new Map<string, (typeof sensorReadings)[0]>();
    for (const reading of sensorReadings) {
      if (!latestSensorMap.has(reading.deviceId)) {
        latestSensorMap.set(reading.deviceId, reading);
      }
    }

    const sensorMetrics: SensorMetric[] = Array.from(latestSensorMap.values()).map((r) => ({
      deviceId: r.deviceId,
      deviceName: deviceNameMap.get(r.deviceId) ?? "Unknown",
      sensorType: r.sensorType,
      value: r.value,
      unit: r.unit,
      status: r.status,
      batteryPct: r.batteryPct,
      signalRssiDbm: r.signalRssiDbm,
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : new Date(r.timestamp).toISOString(),
    }));

    // Sensor readings in range (approximate from limited fetch)
    const readingsInRange = sensorReadings.filter((r) => r.timestamp >= since);
    const totalSensorReadings = readingsInRange.length;
    const sensorStatusCountsData = countBy(readingsInRange.map((r) => r.status));

    // ── 6. Video segments in range ────────────────────────────────────
    const recordingRows = await db
      .select()
      .from(schema.videoSegment)
      .where(and(eq(schema.videoSegment.facilityId, facilityId), gte(schema.videoSegment.createdAt, since)));

    const recordingCount = recordingRows.length;
    const totalRecordingDurationSec = recordingRows.reduce((acc, r) => acc + (r.durationSec ?? 0), 0);

    const recordingByDeviceMap = new Map<string, { count: number; durationSec: number }>();
    for (const rec of recordingRows) {
      const entry = recordingByDeviceMap.get(rec.deviceId) ?? {
        count: 0,
        durationSec: 0,
      };
      entry.count++;
      entry.durationSec += rec.durationSec ?? 0;
      recordingByDeviceMap.set(rec.deviceId, entry);
    }

    const recordingsByDevice: RecordingByDevice[] = Array.from(recordingByDeviceMap.entries()).map(
      ([deviceId, stats]) => ({
        deviceId,
        deviceName: deviceNameMap.get(deviceId) ?? "Unknown",
        count: stats.count,
        durationSec: stats.durationSec,
      }),
    );

    // ── 7. Recent alerts (last 20, regardless of range) ─────────────────
    const recentEventRows = await db
      .select({
        id: schema.facilityEvent.id,
        severity: schema.facilityEvent.severity,
        type: schema.facilityEvent.type,
        message: schema.facilityEvent.message,
        deviceId: schema.facilityEvent.deviceId,
        createdAt: schema.facilityEvent.createdAt,
      })
      .from(schema.facilityEvent)
      .where(eq(schema.facilityEvent.facilityId, facilityId))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(20);

    const recentAlerts: RecentAlert[] = recentEventRows.map((e) => ({
      id: e.id,
      severity: e.severity,
      type: e.type,
      message: e.message,
      deviceId: e.deviceId,
      deviceName: e.deviceId ? (deviceNameMap.get(e.deviceId) ?? null) : null,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : new Date(e.createdAt).toISOString(),
    }));

    // ── 8. Insights & health ────────────────────────────────────────────
    const insights = generateInsights(devices, eventRows, sensorMetrics, anomalyCount, range);
    const healthScore = calculateHealthScore(devices, sensorMetrics, eventRows);

    const overallStatus: OverallStatus = healthScore >= 80 ? "normal" : healthScore >= 50 ? "attention" : "critical";

    // ── 9. Return ───────────────────────────────────────────────────────
    return {
      facilityId,
      facilityName: facility.name,
      generatedAt: new Date().toISOString(),
      range,
      overallStatus,
      healthScore,
      zoneCount: zones.length,
      totalDevices,
      onlineDevices,
      devicesByType: Object.entries(deviceTypeCounts).map(([type, count]) => ({
        type,
        count,
      })),
      devicesByStatus: Object.entries(deviceStatusCounts).map(([status, count]) => ({ status, count })),
      eventCounts: Object.entries(eventSeverityCounts).map(([severity, count]) => ({ severity, count })),
      eventTypeCounts: Object.entries(eventTypeCountResults).map(([type, count]) => ({ type, count })),
      eventBuckets,
      totalEventsInRange,
      anomalyCount,
      sensorMetrics,
      sensorStatusCounts: Object.entries(sensorStatusCountsData).map(([status, count]) => ({ status, count })),
      totalSensorReadings,
      recordingCount,
      totalRecordingDurationSec,
      recordingsByDevice,
      recentAlerts,
      devices,
      insights,
    } satisfies FacilityAnalytics;
  });
