import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { summarizeImage, summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import { createLogger } from "#/lib/logs";
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
  frameId: string;
  assetId: string;
  capturedAt: string; // ISO timestamp
  sequence: number;
};

export type SegmentPayload = {
  kind: "segment";
  facilityId: string;
  deviceId: string;
  segmentId: string;
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
  #log = createLogger("processor");

  async run(event: WorkflowEvent<ProcessorPayload>, step: WorkflowStep): Promise<unknown> {
    const payload = event.payload;
    if (payload.kind === "frame") return this.runFrame(payload, step);
    return this.runSegment(payload, step);
  }

  // ── Frame branch ──────────────────────────────────────────────────────

  private async runFrame(payload: FramePayload, step: WorkflowStep): Promise<{ anomalyCount: number; total: number }> {
    const { facilityId, deviceId, frameId, assetId, capturedAt } = payload;

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

    // Persist per-frame analysis results to video_frames.data so segment
    // workflows can aggregate detections/anomalies durably from D1.
    await step.do("persist-frame-data", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const frameData: Record<string, unknown> = {
        source: "facilix-processor",
        detections: detections.map((d) => ({
          label: d.label,
          confidence: d.confidence,
          box: d.box ? { xmin: d.box.xmin, ymin: d.box.ymin, xmax: d.box.xmax, ymax: d.box.ymax } : null,
          modelId: d.modelId,
        })),
        anomalyCount: anomalies.length,
        anomalies: anomalies.map((a) => ({
          label: a.detection.label,
          confidence: a.detection.confidence,
          pluginId: a.pluginId,
          pluginName: a.pluginName,
          optionId: a.optionId,
          optionLabel: a.optionLabel,
        })),
        detectionCounts: Object.fromEntries(
          Array.from(counts.values()).map((entry) => [entry.plugin.plugin.name, entry.count]),
        ),
        thresholdAlerts: thresholdAlerts.map((ta) => ({
          pluginId: ta.pluginId,
          pluginName: ta.pluginName,
          count: ta.count,
          threshold: ta.config.threshold,
          operator: ta.config.operator,
        })),
        enabledPluginIds: enabledFramePlugins.map((r) => r.plugin.id),
        analyzedAt: new Date().toISOString(),
      };
      await db.update(schema.videoFrame).set({ data: frameData }).where(eq(schema.videoFrame.id, frameId));
    });

    return { anomalyCount: totalAlerts, total: detections.length };
  }

  // ── Segment branch ────────────────────────────────────────────────────

  private async runSegment(
    payload: SegmentPayload,
    step: WorkflowStep,
  ): Promise<{ detectionCounts: Record<string, number>; anomalyCount: number }> {
    const { facilityId, deviceId, segmentId, startedAt, endedAt } = payload;

    // Sleep briefly to allow in-flight frame workflows to finish writing
    // their results to video_frames before we aggregate.
    await step.sleep("wait-for-frames", "5 seconds");

    // Load the CCTV device's intelligence-plugin config so we can
    // find segment-understanding plugins and use their prompts.
    const segmentPlugins: import("#/lib/monitoring/plugins").ResolvedPlugin<
      import("#/lib/monitoring/plugins").SegmentAnalysisDeviceConfig
    >[] = [];
    await step.do("load-device-plugins", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const [row] = await db
        .select({ data: schema.facilityDevice.data })
        .from(schema.facilityDevice)
        .where(eq(schema.facilityDevice.id, deviceId))
        .limit(1);
      const configs = normalizePlugins((row?.data as JsonObject | undefined)?.plugins);
      const enabled = resolveEnabledPlugins(configs);
      for (const r of enabled) {
        if (r.plugin.kind === "segment-understanding") {
          segmentPlugins.push(
            r as unknown as import("#/lib/monitoring/plugins").ResolvedPlugin<
              import("#/lib/monitoring/plugins").SegmentAnalysisDeviceConfig
            >,
          );
        }
      }
    });

    // Aggregate analysis from video_frames rows that fall within the
    // segment's time window. This is durable — frame results persist in D1.
    const aggregate = await step.do("aggregate-frame-data", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const startMs = new Date(startedAt).getTime();
      const frameRows = await db
        .select()
        .from(schema.videoFrame)
        .where(
          and(
            eq(schema.videoFrame.deviceId, deviceId),
            gte(schema.videoFrame.capturedAt, new Date(startedAt)),
            lte(schema.videoFrame.capturedAt, new Date(endedAt)),
          ),
        )
        .orderBy(desc(schema.videoFrame.capturedAt));

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
      let pendingFrameCount = 0;

      for (const frame of frameRows) {
        if (frameSamples.length < 12) frameSamples.push(frame.assetId);

        const frameData = frame.data as Record<string, unknown> | null;
        if (!frameData || !frameData.analyzedAt) {
          pendingFrameCount++;
          continue;
        }

        // Aggregate detection counts
        const counts = frameData.detectionCounts as Record<string, number> | undefined;
        if (counts) {
          for (const [label, count] of Object.entries(counts)) {
            detectionCounts[label] = (detectionCounts[label] ?? 0) + count;
          }
        }

        // Aggregate anomalies
        const frameAnomalies = frameData.anomalies as Array<Record<string, unknown>> | undefined;
        if (frameAnomalies) {
          for (const a of frameAnomalies) {
            const atSec = Math.max(0, Math.round((frame.capturedAt.getTime() - startMs) / 1000));
            detectionCounts[(a.pluginName ?? a.optionLabel ?? a.label) as string] =
              (detectionCounts[(a.pluginName ?? a.optionLabel ?? a.label) as string] ?? 0) + 1;
            anomalies.push({
              label: (a.label as string) ?? "unknown",
              confidence: (a.confidence as number) ?? 0,
              atSec,
              assetId: frame.assetId,
              pluginId: a.pluginId as string | undefined,
              pluginName: a.pluginName as string | undefined,
              optionId: a.optionId as string | undefined,
              optionLabel: a.optionLabel as string | undefined,
            });
          }
        }
      }

      // Fallback: if no frames found in D1, try facility_events for anomaly data
      if (frameRows.length === 0) {
        const eventRows = await db
          .select()
          .from(schema.facilityEvent)
          .where(
            and(
              eq(schema.facilityEvent.deviceId, deviceId),
              eq(schema.facilityEvent.type, "cctv:anomaly"),
              gte(schema.facilityEvent.createdAt, new Date(startedAt)),
              lte(schema.facilityEvent.createdAt, new Date(endedAt)),
            ),
          )
          .orderBy(desc(schema.facilityEvent.createdAt));

        for (const ev of eventRows) {
          const ed = ev.data as Record<string, unknown>;
          if (ev.deviceId && frameSamples.length < 12 && ed.assetId) {
            frameSamples.push(ed.assetId as string);
          }
          const label = typeof ed.optionLabel === "string" ? ed.optionLabel : ((ed.label as string) ?? "unknown");
          detectionCounts[label] = (detectionCounts[label] ?? 0) + 1;
          anomalies.push({
            label: label,
            confidence: (ed.confidence as number) ?? 0,
            atSec: 0,
            assetId: ed.assetId as string | undefined,
            pluginId: ed.pluginId as string | undefined,
            pluginName: ed.pluginName as string | undefined,
            optionId: ed.optionId as string | undefined,
            optionLabel: ed.optionLabel as string | undefined,
          });
        }
      }

      return { detectionCounts, anomalies, frameSamples, frameCount: frameRows.length, pendingFrameCount };
    });

    const sceneSummary = await step.do<string | null>("summarize-scene", STEP_RETRIES, async () => {
      const labelList = Object.entries(aggregate.detectionCounts)
        .filter(([k]) => !k.startsWith("__"))
        .map(([label, count]) => `${count}× ${label}`)
        .join(", ");

      // Build the prompt from the first enabled segment-understanding plugin.
      // If none is configured, use the legacy hardcoded basePrompt as a fallback.
      const segmentPlugin = segmentPlugins[0];
      const prompt = segmentPlugin
        ? (segmentPlugin.config as import("#/lib/monitoring/plugins").SegmentAnalysisDeviceConfig).prompt
        : null;
      const basePrompt =
        prompt ??
        `This is a CCTV segment from a monitored facility. Detected anomalies in this segment: ${labelList || "none"}. ` +
          "Describe what is happening in the scene in one or two sentences. Be factual and concise.";

      // Gate: run only if a segment-understanding plugin is enabled OR
      // frame anomalies exist (legacy path).
      const hasSegmentPlugin = segmentPlugins.length > 0;
      if (!hasSegmentPlugin && aggregate.anomalies.length === 0) {
        return null;
      }

      // Preferred path: send the actual segment video clip to the multimodal
      // OpenRouter model. Falls back to the best single frame if video
      // input fails for any reason.
      try {
        const segmentObject = await this.env.BUCKET.get(payload.assetId);
        if (segmentObject) {
          const buffer = await segmentObject.arrayBuffer();
          const summary = await summarizeVideo(new Uint8Array(buffer), "video/mp4", basePrompt);
          if (summary) {
            this.#log.info("segment AI summary ok (video)", {
              length: summary.length,
              prompt: basePrompt.slice(0, 80),
            });
            return summary;
          }
        }
      } catch (err) {
        this.#log.error("summarizeVideo failed, falling back to image", {
          error: String(err),
          segmentId: payload.segmentId,
        });
      }

      // Fallback: use a frame as JPEG still image.
      const bestFrameAsset =
        aggregate.anomalies.length > 0
          ? aggregate.anomalies.reduce((a, b) => (a.confidence >= b.confidence ? a : b)).assetId
          : (aggregate.frameSamples[0] ?? payload.assetId);

      if (bestFrameAsset) {
        try {
          const object = await this.env.BUCKET.get(bestFrameAsset);
          if (object) {
            const buffer = await object.arrayBuffer();
            const summary = await summarizeImage(new Uint8Array(buffer), "image/jpeg", basePrompt);
            if (summary) {
              this.#log.info("segment AI summary ok (image)", { length: summary.length });
              return summary;
            }
          }
        } catch (err) {
          this.#log.error("summarizeImage fallback failed", {
            error: String(err),
            segmentId: payload.segmentId,
          });
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
        frameCount: aggregate.frameCount,
        pendingFrameCount: aggregate.pendingFrameCount,
        sceneSummary,
        analyzedAt: new Date().toISOString(),
      };
      await db.update(schema.videoSegment).set({ data }).where(eq(schema.videoSegment.id, segmentId));

      const observer = this.env.OBSERVER.getByName(facilityId);
      const anomalyCount = aggregate.anomalies.length;
      const message = sceneSummary
        ? `Segment analyzed: ${sceneSummary}`
        : `Segment analyzed — ${anomalyCount} anomal${anomalyCount === 1 ? "y" : "ies"}`;
      await recordObservation(observer, deviceId, "cctv:segment:analyzed", "info", message, {
        source: "facilix-processor",
        segmentId,
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
          segmentId,
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
