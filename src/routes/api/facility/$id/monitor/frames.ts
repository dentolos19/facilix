import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDatabase } from "#/lib/database";
import { recordFacilityEvent, validateDevice } from "#/lib/monitoring/utils";

/**
 * Known COCO classes that indicate "possible anomaly" for facility monitoring.
 * The DETR model returns labels matching the COCO 2017 dataset.
 */
const ANOMALY_CLASSES = new Set([
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "bus",
  "truck",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "backpack",
  "umbrella",
  "handbag",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "knife",
  "spoon",
  "bowl",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "book",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
]);

const MIN_CONFIDENCE = 0.4;

/**
 * POST /api/facility/:id/monitor/frames
 *
 * Called by the Python monitor container with a sampled video frame.
 * Runs Workers AI object detection and emits events when anomalies are found.
 *
 * Body: multipart or raw binary (JPEG/PNG)
 * Headers: X-Device-Id, X-Timestamp
 */
export const Route = createFileRoute("/api/facility/$id/monitor/frames")({
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

        // Read the raw image bytes
        const blob = await request.blob();
        if (blob.size === 0) {
          return Response.json({ error: "Empty frame" }, { status: 400 });
        }

        const buffer = await blob.arrayBuffer();
        const imageBytes = new Uint8Array(buffer);

        // Run Workers AI object detection
        let detections: { label: string; confidence: number; box?: number[] }[] = [];
        try {
          const aiResult = await env.AI.run("@cf/facebook/detr-resnet-50", {
            image: imageBytes,
          });

          // DETR returns an array of detections
          const raw = aiResult as Array<{ label: string; score: number; box?: number[] }>;
          if (Array.isArray(raw)) {
            detections = raw
              .filter((d) => d.score >= MIN_CONFIDENCE)
              .map((d) => ({ label: d.label, confidence: d.score, box: d.box }));
          }
        } catch (err) {
          console.error("Workers AI inference failed:", err);
          // Don't block — emit a diagnostic event but don't fail the request
        }

        // Classify detections
        const anomalyDetections = detections.filter((d) => ANOMALY_CLASSES.has(d.label));
        const detectionLabels = anomalyDetections.map((d) => d.label);
        const maxConfidence =
          anomalyDetections.length > 0 ? Math.max(...anomalyDetections.map((d) => d.confidence)) : 0;

        // Report frame-ok heartbeat (info-level, no anomaly)
        if (anomalyDetections.length === 0) {
          await recordFacilityEvent(
            db,
            env.OBSERVER.getByName(params.id),
            params.id,
            deviceId,
            "cctv:frame:ok",
            "info",
            `Frame analyzed — ${detections.length} object(s) detected, no anomalies`,
            { source: "monitor-container", objectCount: detections.length },
          );
        }

        // Report each anomaly as a separate event
        for (const det of anomalyDetections) {
          const severity = det.confidence > 0.7 ? "warn" : "info";
          await recordFacilityEvent(
            db,
            env.OBSERVER.getByName(params.id),
            params.id,
            deviceId,
            "cctv:anomaly",
            severity,
            `${det.label} detected (${(det.confidence * 100).toFixed(0)}%)`,
            {
              source: "monitor-container",
              label: det.label,
              confidence: det.confidence,
              maxConfidence,
              detectionCount: anomalyDetections.length,
            },
          );
        }

        return Response.json({
          success: true,
          detections: detectionLabels,
          anomalyCount: anomalyDetections.length,
          totalDetections: detections.length,
          maxConfidence,
        });
      },
    },
  },
});
