import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";

/** A detection from the Roboflow workflow. */
export interface RecordingDetection {
  label: string;
  confidence: number;
  box?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  atSec?: number;
  frameIndex?: number;
  trackId?: string;
  classId?: number;
}

/** An anomaly with timestamp for playback timeline. */
export interface RecordingAnomaly {
  label: string;
  confidence: number;
  atSec: number;
  box?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

/** Per-plugin detection result stored in segment data. */
export interface RecordingPluginResult {
  pluginId: string;
  pluginName: string;
  workflowId: string;
  detectionCounts?: Record<string, number>;
  maxCount?: number;
  thresholdAlert?: boolean;
  threshold?: {
    exceeded: boolean;
    count: number;
    threshold: number;
    operator: string;
    thresholdMode: string;
  };
}

/** A threshold alert stored in segment data. */
export interface RecordingAlert {
  pluginId: string;
  pluginName: string;
  count: number;
  threshold: number;
  operator: string;
  thresholdMode: string;
  severity: string;
}

export interface RecordingRow {
  id: string;
  assetId: string;
  facilityId: string;
  deviceId: string;
  durationSec: number | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  /** Roboflow workflow detections and optional OpenRouter scene summary. */
  data: {
    source?: string;
    analysisVersion?: number;
    detections?: RecordingDetection[];
    detectionCounts?: Record<string, number>;
    anomalies?: RecordingAnomaly[];
    pluginResults?: RecordingPluginResult[];
    alerts?: RecordingAlert[];
    sceneSummary?: string | null;
    analyzedAt?: string;
  } | null;
}

function toRecording(row: typeof schema.videoSegment.$inferSelect): RecordingRow {
  return {
    id: row.id,
    assetId: row.assetId,
    facilityId: row.facilityId,
    deviceId: row.deviceId,
    durationSec: row.durationSec,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    data: (row.data ?? null) as RecordingRow["data"],
  };
}

/**
 * Get the most recent video segments for a specific CCTV device.
 * Results are newest-first, limited to `limit` (default 50, max 200).
 */
export const getDeviceRecordings = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; deviceId: string; limit?: number }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.deviceId) throw new Error("Device ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    const limit = Math.min(Math.max(1, data.limit ?? 50), 200);

    const rows = await db
      .select()
      .from(schema.videoSegment)
      .where(eq(schema.videoSegment.deviceId, data.deviceId))
      .orderBy(desc(schema.videoSegment.createdAt))
      .limit(limit);

    return rows.map(toRecording);
  });
