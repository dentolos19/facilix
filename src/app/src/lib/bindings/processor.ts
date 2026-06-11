import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createDatabase, schema } from "#/src/lib/database";
import { ANOMALY_CLASSES, type Detection, type DetectionBox, MIN_CONFIDENCE } from "#/src/lib/monitoring/detection";
import { recordFacilityEvent, recordObservation } from "#/src/lib/monitoring/utils";

/**
 * Durable processor for CCTV frames and video segments.
 *
 * Frame uploads and segment uploads are persisted to R2 by the HTTP handlers
 * (`monitoring/api.ts`), then the workflow is dispatched with a JSON pointer
 * (`assetId` + metadata). Each AI inference / DB write runs inside `step.do`,
 * which retries automatically on transient failures.
 *
 * Triggered from `handleFrame` and `handleSegment` via `env.PROCESSOR.create({ params })`.
 */

export type FramePayload = {
  kind: "frame";
  facilityId: string;
  deviceId: string;
  assetId: string;
  capturedAt: string; // ISO timestamp
  sequence: number;
};

export type SegmentPayload = {
  kind: "segment";
  facilityId: string;
  deviceId: string;
  recordingId: string;
  assetId: string;
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  durationSec: number;
};

export type ProcessorPayload = FramePayload | SegmentPayload;

const STEP_RETRIES = {
  retries: { limit: 3, delay: "5 seconds" as const, backoff: "exponential" as const },
  timeout: "1 minute" as const,
};

export class Processor extends WorkflowEntrypoint<Env, ProcessorPayload> {
  async run(event: WorkflowEvent<ProcessorPayload>, step: WorkflowStep): Promise<unknown> {
    const payload = event.payload;
    if (payload.kind === "frame") return this.runFrame(payload, step);
    return this.runSegment(payload, step);
  }

  // ── Frame branch ──────────────────────────────────────────────────────

  private async runFrame(payload: FramePayload, step: WorkflowStep): Promise<{ anomalyCount: number; total: number }> {
    const { facilityId, deviceId, assetId, capturedAt } = payload;

    const frameBytes = await step.do("load-frame", STEP_RETRIES, async () => {
      const object = await this.env.BUCKET.get(assetId);
      if (!object) throw new Error(`frame not found in R2: ${assetId}`);
      const buffer = await object.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    });

    const detections = await step.do<Detection[]>("detect-objects", STEP_RETRIES, async () => {
      const aiResult = await this.env.AI.run("@cf/facebook/detr-resnet-50", {
        image: frameBytes,
      });
      if (!Array.isArray(aiResult)) return [];
      return (aiResult as Array<{ label: string; score: number; box?: DetectionBox }>)
        .filter((d) => d.score >= MIN_CONFIDENCE)
        .map((d) => ({ label: d.label, confidence: d.score, box: d.box }));
    });

    const anomalies = detections.filter((d) => ANOMALY_CLASSES.has(d.label));

    await step.do("record-detections", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const observer = this.env.OBSERVER.getByName(facilityId);

      if (anomalies.length === 0) {
        await recordObservation(
          observer,
          deviceId,
          "cctv:frame:ok",
          "info",
          `Frame analyzed — ${detections.length} object(s) detected, no anomalies`,
          {
            source: "facilix-processor",
            objectCount: detections.length,
            assetId,
            capturedAt,
          },
        );
        return { anomalyCount: 0, total: detections.length };
      }

      for (const det of anomalies) {
        const severity = det.confidence > 0.7 ? "warn" : "info";
        const message = `${det.label} detected (${(det.confidence * 100).toFixed(0)}%)`;
        const data = {
          source: "facilix-processor",
          label: det.label,
          confidence: det.confidence,
          detectionCount: anomalies.length,
          assetId,
          capturedAt,
        };
        await recordObservation(observer, deviceId, "cctv:anomaly", severity, message, data);
        await recordFacilityEvent(db, facilityId, deviceId, "cctv:anomaly", severity, message, data);
      }
      return { anomalyCount: anomalies.length, total: detections.length };
    });

    return { anomalyCount: anomalies.length, total: detections.length };
  }

  // ── Segment branch ────────────────────────────────────────────────────

  private async runSegment(
    payload: SegmentPayload,
    step: WorkflowStep,
  ): Promise<{ detectionCounts: Record<string, number>; anomalyCount: number }> {
    const { facilityId, deviceId, recordingId, startedAt, endedAt } = payload;

    const windowEvents = await step.do("load-window-detections", STEP_RETRIES, async () => {
      const observer = this.env.OBSERVER.getByName(facilityId);
      return observer.queryByDeviceWindow(deviceId, startedAt, endedAt, ["cctv:frame:ok", "cctv:anomaly"]);
    });

    const aggregate = await step.do("aggregate", async () => {
      const startMs = new Date(startedAt).getTime();
      const detectionCounts: Record<string, number> = {};
      const anomalies: Array<{ label: string; confidence: number; atSec: number; assetId?: string }> = [];
      const frameSamples: string[] = [];

      for (const ev of windowEvents) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(ev.data) as Record<string, unknown>;
        } catch {
          continue;
        }
        const assetId = typeof parsed.assetId === "string" ? parsed.assetId : undefined;
        if (assetId && frameSamples.length < 12) frameSamples.push(assetId);

        if (ev.type === "cctv:anomaly") {
          const label = typeof parsed.label === "string" ? parsed.label : "unknown";
          const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
          const atSec = Math.max(0, Math.round((new Date(ev.createdAt).getTime() - startMs) / 1000));
          detectionCounts[label] = (detectionCounts[label] ?? 0) + 1;
          anomalies.push({ label, confidence, atSec, assetId });
        } else if (ev.type === "cctv:frame:ok") {
          const objectCount = typeof parsed.objectCount === "number" ? parsed.objectCount : 0;
          if (objectCount > 0) {
            detectionCounts.__objectsObserved = (detectionCounts.__objectsObserved ?? 0) + objectCount;
          }
        }
      }
      return { detectionCounts, anomalies, frameSamples };
    });

    const sceneSummary = await step.do<string | null>("summarize-scene", STEP_RETRIES, async () => {
      if (aggregate.anomalies.length === 0) return null;
      const best = aggregate.anomalies.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
      if (!best.assetId) return null;

      const object = await this.env.BUCKET.get(best.assetId);
      if (!object) return null;
      const buffer = await object.arrayBuffer();
      const imageBytes = Array.from(new Uint8Array(buffer));

      const labelList = Object.entries(aggregate.detectionCounts)
        .filter(([k]) => !k.startsWith("__"))
        .map(([label, count]) => `${count}× ${label}`)
        .join(", ");

      const prompt =
        `This is a CCTV frame from a monitored facility. Detected objects in this segment: ${labelList || "none"}. ` +
        "Describe what is happening in the frame in one or two sentences. Be factual and concise.";

      const aiResult = await this.env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
        image: imageBytes,
        prompt,
        max_tokens: 200,
      });
      const description =
        (aiResult as { description?: string } | undefined)?.description ??
        (typeof aiResult === "string" ? aiResult : null);
      return description?.trim() || null;
    });

    await step.do("persist", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const data = {
        source: "facilix-processor",
        detectionCounts: aggregate.detectionCounts,
        anomalies: aggregate.anomalies,
        frameSamples: aggregate.frameSamples,
        sceneSummary,
        analyzedAt: new Date().toISOString(),
      };
      await db.update(schema.videoRecording).set({ data }).where(eq(schema.videoRecording.id, recordingId));

      const observer = this.env.OBSERVER.getByName(facilityId);
      const anomalyCount = aggregate.anomalies.length;
      const message = sceneSummary
        ? `Segment analyzed: ${sceneSummary}`
        : `Segment analyzed — ${anomalyCount} anomal${anomalyCount === 1 ? "y" : "ies"}`;
      await recordObservation(observer, deviceId, "cctv:segment:analyzed", "info", message, {
        source: "facilix-processor",
        recordingId,
        anomalyCount,
        detectionCounts: aggregate.detectionCounts,
      });
      if (anomalyCount > 0) {
        await recordFacilityEvent(db, facilityId, deviceId, "cctv:segment:analyzed", "info", message, {
          source: "facilix-processor",
          recordingId,
          anomalyCount,
          detectionCounts: aggregate.detectionCounts,
          sceneSummary,
        });
      }
    });

    return {
      detectionCounts: aggregate.detectionCounts,
      anomalyCount: aggregate.anomalies.length,
    };
  }
}
