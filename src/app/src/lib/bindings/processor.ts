import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { summarizeImage, summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import type { Detection } from "#/lib/monitoring/detection";
import { normalizeFacilitySettings, shouldShowInGlobalEvents } from "#/lib/monitoring/logs";
import {
  type AlertMatch,
  countByClassGroup,
  findAlertMatch,
  normalizePlugins,
  resolveEnabledPlugins,
  thresholdExceeded,
} from "#/lib/monitoring/plugins";
import { detectObjects } from "#/lib/monitoring/roboflow";
import { recordFacilityEvent, recordObservation } from "#/lib/monitoring/utils";
import type { JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

/**
 * Durable processor for CCTV frames and video segments.
 *
 * Frame uploads and segment uploads are persisted to R2 by the HTTP handlers
 * (`monitoring/api.ts`), then the workflow is dispatched with a JSON pointer
 * (`assetId` + metadata). Each AI inference / DB write runs inside `step.do`,
 * which retries automatically on transient failures.
 *
 * Object detection is performed by Roboflow hosted inference
 * (`monitoring/roboflow.ts`) and scene understanding by OpenRouter
 * (`lib/ai.ts`).
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

    // Load the CCTV device's intelligence-plugin config. If a device has no
    // enabled plugins, no Roboflow calls are made and no anomalies can
    // be raised — plugins are the single source of truth.
    const { resolved } = await step.do("load-device-plugins", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const [row] = await db
        .select({ data: schema.facilityDevice.data })
        .from(schema.facilityDevice)
        .where(eq(schema.facilityDevice.id, deviceId))
        .limit(1);
      const configs = normalizePlugins((row?.data as JsonObject | undefined)?.plugins);
      const enabled = resolveEnabledPlugins(configs);
      return { resolved: enabled };
    });

    // Build Roboflow model requests from frame-capable plugins only.
    const env = this.env as unknown as Record<string, string | undefined>;
    const modelRequests: import("#/lib/monitoring/roboflow").RoboflowModelRequest[] = [];
    for (const r of resolved) {
      if (r.plugin.kind !== "object-anomaly" && r.plugin.kind !== "object-counting") continue;
      if (!r.plugin.modelId && !r.plugin.modelEnv) continue;
      const spec = resolveModelSpec(r.plugin, env);
      if (!spec) continue;
      // Use the plugin's confidence if it has one
      const confidence = "confidence" in r.config ? (r.config as { confidence: number }).confidence : 0.4;
      modelRequests.push({ spec, confidence });
    }

    const frameBytes = await step.do("load-frame", STEP_RETRIES, async () => {
      const object = await this.env.BUCKET.get(assetId);
      if (!object) throw new Error(`frame not found in R2: ${assetId}`);
      const buffer = await object.arrayBuffer();
      return new Uint8Array(buffer);
    });

    const detections = await step.do<Detection[]>("detect-objects", STEP_RETRIES, async () => {
      return detectObjects(frameBytes, modelRequests);
    });

    // ── Object-anomaly matching ──
    const matches = detections
      .map((d) => {
        const match = findAlertMatch(resolved, d);
        return match ? { detection: d, match } : null;
      })
      .filter((m): m is { detection: Detection; match: AlertMatch } => m !== null);
    const anomalies = matches.map((m) => ({
      detection: m.detection,
      pluginId: m.match.plugin.id,
      pluginName: m.match.plugin.name,
      optionId: m.match.option.id,
      optionLabel: m.match.option.label,
    }));

    // ── Object-counting threshold checks ──
    const counts = countByClassGroup(resolved, detections);
    const thresholdAlerts: Array<{
      pluginId: string;
      pluginName: string;
      count: number;
      config: import("#/lib/monitoring/plugins").ObjectCountingDeviceConfig;
    }> = [];
    for (const [, entry] of counts) {
      if (thresholdExceeded(entry.count, entry.config)) {
        thresholdAlerts.push({
          pluginId: entry.plugin.plugin.id,
          pluginName: entry.plugin.plugin.name,
          count: entry.count,
          config: entry.config,
        });
      }
    }

    const enabledFramePlugins = resolved.filter(
      (r) => r.plugin.kind === "object-anomaly" || r.plugin.kind === "object-counting",
    );
    const totalAlerts = anomalies.length + thresholdAlerts.length;

    await step.do("record-detections", STEP_RETRIES, async () => {
      const observer = this.env.OBSERVER.getByName(facilityId);

      if (totalAlerts === 0) {
        await recordObservation(
          observer,
          deviceId,
          "cctv:frame:ok",
          "info",
          enabledFramePlugins.length === 0
            ? `Frame stored — no intelligence plugins enabled`
            : `Frame analyzed — ${detections.length} object(s) detected, no alerts`,
          {
            source: "facilix-processor",
            objectCount: detections.length,
            assetId,
            capturedAt,
            enabledPlugins: enabledFramePlugins.map((r) => ({
              id: r.plugin.id,
              name: r.plugin.name,
              kind: r.plugin.kind,
            })),
          },
        );
        return { anomalyCount: 0, total: detections.length };
      }

      // Anomaly events
      for (const a of anomalies) {
        const severity = a.detection.confidence > 0.7 ? "warn" : "info";
        const message = `${a.optionLabel} detected (${(a.detection.confidence * 100).toFixed(0)}%)`;
        const data = {
          source: "facilix-processor",
          kind: "object-anomaly",
          label: a.detection.label,
          optionId: a.optionId,
          optionLabel: a.optionLabel,
          pluginId: a.pluginId,
          pluginName: a.pluginName,
          confidence: a.detection.confidence,
          detectionCount: anomalies.length,
          assetId,
          capturedAt,
          modelId: a.detection.modelId,
        };
        await recordObservation(observer, deviceId, "cctv:anomaly", severity, message, data);
      }

      // Counting threshold alerts
      for (const ta of thresholdAlerts) {
        const severity = "warn";
        const message = `${ta.pluginName} threshold crossed: ${ta.count} (${ta.config.operator} ${ta.config.threshold})`;
        const data = {
          source: "facilix-processor",
          kind: "object-counting",
          pluginId: ta.pluginId,
          pluginName: ta.pluginName,
          count: ta.count,
          threshold: ta.config.threshold,
          operator: ta.config.operator,
          assetId,
          capturedAt,
        };
        await recordObservation(observer, deviceId, "cctv:anomaly", severity, message, data);
      }

      // Persist alerts to D1 in a single batched write.
      const db = createDatabase(this.env.DATABASE);
      const now = new Date();
      const allAlerts = [
        ...anomalies.map((a) => ({
          id: crypto.randomUUID(),
          facilityId,
          deviceId,
          severity: (a.detection.confidence > 0.7 ? "warn" : "info") as "info" | "warn" | "error",
          type: "cctv:anomaly",
          message: `${a.optionLabel} detected (${(a.detection.confidence * 100).toFixed(0)}%)`,
          data: {
            source: "facilix-processor",
            kind: "object-anomaly",
            label: a.detection.label,
            optionId: a.optionId,
            optionLabel: a.optionLabel,
            pluginId: a.pluginId,
            pluginName: a.pluginName,
            confidence: a.detection.confidence,
            detectionCount: anomalies.length,
            assetId,
            capturedAt,
            modelId: a.detection.modelId,
          },
          createdAt: now,
          updatedAt: now,
        })),
        ...thresholdAlerts.map((ta) => ({
          id: crypto.randomUUID(),
          facilityId,
          deviceId,
          severity: "warn" as const,
          type: "cctv:anomaly",
          message: `${ta.pluginName} threshold crossed: ${ta.count} (${ta.config.operator} ${ta.config.threshold})`,
          data: {
            source: "facilix-processor",
            kind: "object-counting",
            pluginId: ta.pluginId,
            pluginName: ta.pluginName,
            count: ta.count,
            threshold: ta.config.threshold,
            operator: ta.config.operator,
            assetId,
            capturedAt,
          },
          createdAt: now,
          updatedAt: now,
        })),
      ];
      await db.insert(schema.facilityEvent).values(allAlerts);
      return { anomalyCount: totalAlerts, total: detections.length };
    });

    return { anomalyCount: totalAlerts, total: detections.length };
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
      const anomalies: Array<{
        label: string;
        confidence: number;
        atSec: number;
        assetId?: string;
        pluginId?: string;
        pluginName?: string;
        optionId?: string;
        optionLabel?: string;
      }> = [];
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
          const optionLabel = typeof parsed.optionLabel === "string" ? parsed.optionLabel : label;
          const pluginId = typeof parsed.pluginId === "string" ? parsed.pluginId : undefined;
          const pluginName = typeof parsed.pluginName === "string" ? parsed.pluginName : undefined;
          const optionId = typeof parsed.optionId === "string" ? parsed.optionId : undefined;
          const displayLabel = pluginName ? `${pluginName} · ${optionLabel}` : optionLabel;
          detectionCounts[displayLabel] = (detectionCounts[displayLabel] ?? 0) + 1;
          anomalies.push({
            label,
            confidence,
            atSec,
            assetId,
            pluginId,
            pluginName,
            optionId,
            optionLabel,
          });
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
      const labelList = Object.entries(aggregate.detectionCounts)
        .filter(([k]) => !k.startsWith("__"))
        .map(([label, count]) => `${count}× ${label}`)
        .join(", ");

      const basePrompt =
        `This is a CCTV segment from a monitored facility. Detected anomalies in this segment: ${labelList || "none"}. ` +
        "Describe what is happening in the scene in one or two sentences. Be factual and concise.";

      // Preferred path: send the full video clip to the multimodal
      // OpenRouter model when we have an assetId that points at a
      // segment file. Falls back to the best single frame if video
      // input fails for any reason.
      if (aggregate.anomalies.length > 0) {
        const best = aggregate.anomalies.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
        if (best.assetId) {
          try {
            const segmentObject = await this.env.BUCKET.get(best.assetId);
            if (segmentObject) {
              const buffer = await segmentObject.arrayBuffer();
              const summary = await summarizeVideo(new Uint8Array(buffer), "video/mp4", basePrompt);
              if (summary) return summary;
            }
          } catch (err) {
            // Fall through to image summary if the model can't accept
            // video input or any other transient error occurs.
            console.error("summarizeVideo failed, falling back to image:", err);
          }
        }
      }

      // Fallback: best-detection frame as a JPEG.
      if (aggregate.anomalies.length > 0) {
        const best = aggregate.anomalies.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
        if (best.assetId) {
          const object = await this.env.BUCKET.get(best.assetId);
          if (object) {
            const buffer = await object.arrayBuffer();
            return summarizeImage(new Uint8Array(buffer), "image/jpeg", basePrompt);
          }
        }
      }

      return null;
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

      const [facRow] = await db
        .select({ settings: schema.facility.settings })
        .from(schema.facility)
        .where(eq(schema.facility.id, facilityId))
        .limit(1);
      const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);
      if (shouldShowInGlobalEvents("cctv:segment:analyzed", "info", settings)) {
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

/**
 * Resolve the Roboflow model spec for an intelligence plugin.
 * Reads the `modelEnv` env var override if available, else uses the
 * hardcoded `modelId`.  Returns `null` when no spec can be resolved.
 */
function resolveModelSpec(
  plugin: import("#/lib/monitoring/plugins").Plugin,
  env?: Record<string, string | undefined>,
): import("#/lib/monitoring/roboflow").RoboflowModelSpec | null {
  // Try env override first
  if (plugin.modelEnv && env) {
    const raw = env[plugin.modelEnv];
    if (raw && raw.length > 0) {
      const [project, version] = raw.split("/");
      if (project && version) return { project, version };
    }
  }
  // Fallback to hardcoded modelId
  if (plugin.modelId) {
    const [project, version] = plugin.modelId.split("/");
    if (project && version) return { project, version };
  }
  return null;
}
