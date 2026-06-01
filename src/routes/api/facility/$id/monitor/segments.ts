import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { recordFacilityEvent, validateDevice } from "#/lib/bindings/monitor-helpers";
import { createDatabase } from "#/lib/database";
import * as schema from "#/lib/database/schema";

const MAX_SEGMENT_SIZE = 50 * 1024 * 1024; // 50 MB limit

/**
 * POST /api/facility/:id/monitor/segments
 *
 * Called by the Python monitor container to store a CCTV video segment in R2.
 * Also records playback metadata in D1 and emits an Observer event.
 *
 * Body: raw binary (MP4/HLS segment)
 * Headers:
 *   X-Device-Id     – device UUID
 *   Content-Type     – video/mp4 or video/mp2t
 *   X-Duration-Sec   – segment duration in seconds (optional)
 *   X-Timestamp      – ISO 8601 start-of-segment timestamp (optional)
 */
export const Route = createFileRoute("/api/facility/$id/monitor/segments")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const auth = request.headers.get("authorization");
        const expected = env.MONITOR_INGEST_TOKEN;
        if (!expected || auth !== `Bearer ${expected}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const deviceId = request.headers.get("X-Device-Id");
        if (!deviceId) {
          return Response.json({ error: "Missing X-Device-Id header" }, { status: 400 });
        }

        const db = createDatabase(env.DATABASE);
        const device = await validateDevice(db, params.id, deviceId);
        if (!device) {
          return Response.json({ error: "Device not found for this facility" }, { status: 404 });
        }

        const blob = await request.blob();
        if (blob.size === 0) {
          return Response.json({ error: "Empty segment" }, { status: 400 });
        }
        if (blob.size > MAX_SEGMENT_SIZE) {
          return Response.json({ error: "Segment too large (max 50 MB)" }, { status: 413 });
        }

        const contentType = request.headers.get("content-type") ?? "video/mp4";
        const durationHeader = request.headers.get("X-Duration-Sec");
        const parsedDurationSec = durationHeader ? Number(durationHeader) : undefined;
        const durationSec =
          parsedDurationSec !== undefined && Number.isFinite(parsedDurationSec) && parsedDurationSec > 0
            ? parsedDurationSec
            : undefined;
        const timestampHeader = request.headers.get("X-Timestamp");
        const startedAt = timestampHeader ? new Date(timestampHeader) : new Date();
        if (Number.isNaN(startedAt.getTime())) {
          return Response.json({ error: "Invalid X-Timestamp header" }, { status: 400 });
        }
        const endedAt = durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : startedAt;

        // Build a predictable R2 key: facilities/{facilityId}/devices/{deviceId}/cctv/{yyyy}/{mm}/{dd}/{timestamp}.mp4
        const pad = (n: number) => String(n).padStart(2, "0");
        const y = startedAt.getUTCFullYear();
        const m = pad(startedAt.getUTCMonth() + 1);
        const d = pad(startedAt.getUTCDate());
        const hh = pad(startedAt.getUTCHours());
        const mm = pad(startedAt.getUTCMinutes());
        const ss = pad(startedAt.getUTCSeconds());
        const ms = String(startedAt.getUTCMilliseconds()).padStart(3, "0");
        const r2Key = `facilities/${params.id}/devices/${deviceId}/cctv/${y}/${m}/${d}/${hh}${mm}${ss}-${ms}.mp4`;

        // Upload to R2
        const buffer = await blob.arrayBuffer();
        try {
          await env.BUCKET.put(r2Key, buffer, {
            httpMetadata: { contentType },
            customMetadata: {
              facilityId: params.id,
              deviceId,
              startedAt: startedAt.toISOString(),
            },
          });
        } catch (err) {
          console.error("R2 put failed:", err);
          return Response.json({ error: "Failed to store segment" }, { status: 500 });
        }

        // Record metadata in D1
        const recordingId = crypto.randomUUID();
        try {
          await db.insert(schema.monitorRecording).values({
            id: recordingId,
            facilityId: params.id,
            deviceId,
            r2Key,
            contentType,
            size: buffer.byteLength,
            durationSec,
            startedAt,
            endedAt,
          });
        } catch (err) {
          console.error("D1 insert for recording failed:", err);
          // Non-fatal — R2 write succeeded
        }

        // Emit event via Observer
        await recordFacilityEvent(
          db,
          env.OBSERVER.getByName(params.id),
          params.id,
          deviceId,
          "cctv:segment:stored",
          "info",
          `Video segment stored (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB)`,
          {
            source: "monitor-container",
            r2Key,
            recordingId,
            durationSec,
            contentType,
            sizeBytes: buffer.byteLength,
          },
        );

        return Response.json({
          success: true,
          recordingId,
          r2Key,
          sizeBytes: buffer.byteLength,
        });
      },
    },
  },
});
