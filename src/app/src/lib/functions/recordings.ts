import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { createDatabase, schema } from "#/lib/database";

export interface RecordingAnomaly {
  label: string;
  confidence: number;
  atSec: number;
  assetId?: string;
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
  /** Aggregated Roboflow detections and OpenRouter scene summary. */
  data: {
    detectionCounts?: Record<string, number>;
    anomalies?: RecordingAnomaly[];
    frameSamples?: string[];
    sceneSummary?: string | null;
    analyzedAt?: string;
    source?: string;
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

export interface FrameRow {
  id: string;
  assetId: string;
  segmentId: string | null;
  facilityId: string;
  deviceId: string;
  sequence: number;
  capturedAt: Date;
  createdAt: Date;
  /** Per-frame analysis results from the processor. */
  data: Record<string, unknown> | null;
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
