import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import { createLogger } from "#/lib/logs";
import {
  evaluateThreshold,
  normalizePlugins,
  resolveEnabledPlugins,
  type SegmentAnalysisDeviceConfig,
  type WorkflowObjectDetectionDeviceConfig,
} from "#/lib/monitoring/plugins";
import { getRuntimeConfig, runVideoObjectDetection, type WorkflowDetection } from "#/lib/monitoring/roboflow";
import { recordEvent } from "#/lib/monitoring/utils";
import type { JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

/**
 * Durable processor for CCTV video segments.
 *
 * Segment uploads are persisted to R2 by the HTTP handlers
 * (`monitoring/api.ts`), then the workflow is dispatched with a JSON pointer
 * (`assetId` + metadata). Each AI inference / DB write runs inside `step.do`,
 * which retries automatically on transient failures.
 *
 * Object detection is performed only for enabled `workflow-object-detection`
 * plugins, each invoking its own Roboflow Workflow. Scene understanding
 * is performed only for enabled `segment-understanding` plugins.
 *
 * Triggered from `handleSegment` via `env.PROCESSOR.create({ params })`.
 */

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

export type ProcessorPayload = SegmentPayload;

const STEP_RETRIES = {
  retries: { limit: 3, delay: "5 seconds" as const, backoff: "exponential" as const },
  timeout: "3 minutes" as const,
};

export class Processor extends WorkflowEntrypoint<Env, ProcessorPayload> {
  #log = createLogger("processor");

  async run(event: WorkflowEvent<ProcessorPayload>, step: WorkflowStep): Promise<unknown> {
    const payload = event.payload;
    return this.runSegment(payload, step);
  }

  // ── Segment processing ────────────────────────────────────────────────────

  private async runSegment(
    payload: SegmentPayload,
    step: WorkflowStep,
  ): Promise<{ detectionCounts: Record<string, number>; detectionCount: number }> {
    const { facilityId, deviceId, segmentId } = payload;

    // Load all enabled plugins for this device
    const resolvedPlugins: import("#/lib/monitoring/plugins").ResolvedPlugin[] = [];
    const detectionPlugins: import("#/lib/monitoring/plugins").ResolvedPlugin<WorkflowObjectDetectionDeviceConfig>[] =
      [];
    const segmentPlugins: import("#/lib/monitoring/plugins").ResolvedPlugin<SegmentAnalysisDeviceConfig>[] = [];

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
        resolvedPlugins.push(r);
        if (r.plugin.kind === "workflow-object-detection") {
          detectionPlugins.push(
            r as unknown as import("#/lib/monitoring/plugins").ResolvedPlugin<WorkflowObjectDetectionDeviceConfig>,
          );
        }
        if (r.plugin.kind === "segment-understanding") {
          segmentPlugins.push(
            r as unknown as import("#/lib/monitoring/plugins").ResolvedPlugin<SegmentAnalysisDeviceConfig>,
          );
        }
      }
    });

    // Load the segment video from R2
    const segmentBytes = await step.do("load-segment", STEP_RETRIES, async () => {
      const object = await this.env.BUCKET.get(payload.assetId);
      if (!object) throw new Error(`segment not found in R2: ${payload.assetId}`);
      const buffer = await object.arrayBuffer();
      return new Uint8Array(buffer);
    });

    // Run Roboflow workflows for each enabled detection plugin
    const runtimeConfig = getRuntimeConfig();
    const pluginResults: PluginDetectionResult[] = [];
    const allDetections: WorkflowDetection[] = [];
    const detectionCounts: Record<string, number> = {};

    for (const detectionPlugin of detectionPlugins) {
      const pluginId = detectionPlugin.plugin.id;
      const pluginWorkflow = detectionPlugin.plugin.workflow;

      if (!pluginWorkflow) {
        this.#log.warn("detection plugin has no workflow config", { pluginId });
        continue;
      }

      const detections = await step.do<WorkflowDetection[]>(`detect-objects-${pluginId}`, STEP_RETRIES, async () => {
        this.#log.info("running Roboflow workflow", {
          pluginId,
          workspace: pluginWorkflow.workspaceName,
          workflow: pluginWorkflow.workflowId,
          segmentSize: segmentBytes.byteLength,
        });
        return runVideoObjectDetection(segmentBytes, pluginWorkflow, facilityId, runtimeConfig);
      });

      // Filter detections by minimum confidence
      const config = detectionPlugin.config as WorkflowObjectDetectionDeviceConfig;
      const filtered = detections.filter((d) => d.confidence >= config.minConfidence);

      // Count detections based on threshold mode
      const countValue = computeCount(filtered, config.thresholdMode);

      // Evaluate threshold
      const thresholdResult = evaluateThreshold(countValue, config);

      pluginResults.push({
        pluginId,
        pluginName: detectionPlugin.plugin.name,
        workflowId: pluginWorkflow.workflowId,
        config,
        detections: filtered,
        detectionCounts: countByLabel(filtered),
        maxCount: countValue,
        thresholdAlert: thresholdResult.exceeded,
        threshold: thresholdResult,
      });

      // Add to aggregated counts
      for (const [label, count] of Object.entries(countByLabel(filtered))) {
        detectionCounts[label] = (detectionCounts[label] ?? 0) + count;
      }
      allDetections.push(...filtered);
    }

    // Build anomalies list for playback timeline (detections with timestamps)
    const anomalies = allDetections
      .filter((d) => d.atSec !== undefined)
      .map((d) => ({
        label: d.label,
        confidence: d.confidence,
        atSec: d.atSec ?? 0,
        box: d.box,
      }));

    // Build threshold alerts for events
    const thresholdAlerts = pluginResults.filter((r) => r.thresholdAlert);

    // Optional: Run OpenRouter for scene understanding if plugin is enabled
    const sceneSummary = await step.do<string | null>("summarize-scene", STEP_RETRIES, async () => {
      const segmentPlugin = segmentPlugins[0];
      if (!segmentPlugin) return null;

      const prompt = (segmentPlugin.config as SegmentAnalysisDeviceConfig).prompt;
      const labelList = Object.entries(detectionCounts)
        .map(([label, count]) => `${count}× ${label}`)
        .join(", ");

      const fullPrompt = prompt + (labelList ? `\n\nDetected objects in this segment: ${labelList}` : "");

      try {
        const summary = await summarizeVideo(segmentBytes, "video/mp4", fullPrompt);
        if (summary) {
          this.#log.info("segment AI summary ok", { length: summary.length });
          return summary;
        }
      } catch (err) {
        this.#log.error("summarizeVideo failed", {
          error: String(err),
          segmentId: payload.segmentId,
        });
      }

      return null;
    });

    // Persist results to video_segments.data
    await step.do("persist", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);

      const data = {
        source: "facilix-processor",
        analysisVersion: 5,
        detections: allDetections.map((d) => ({
          label: d.label,
          confidence: d.confidence,
          box: d.box,
          atSec: d.atSec,
          frameIndex: d.frameIndex,
          trackId: d.trackId,
          classId: d.classId,
        })),
        detectionCounts,
        anomalies,
        pluginResults: pluginResults.map((r) => ({
          pluginId: r.pluginId,
          pluginName: r.pluginName,
          workflowId: r.workflowId,
          detectionCounts: r.detectionCounts,
          maxCount: r.maxCount,
          thresholdAlert: r.thresholdAlert,
          threshold: r.threshold,
        })),
        sceneSummary,
        analyzedAt: new Date().toISOString(),
      };

      await db.update(schema.videoSegment).set({ data }).where(eq(schema.videoSegment.id, segmentId));

      const observer = this.env.OBSERVER.getByName(facilityId);
      const detectionCount = allDetections.length;
      const anomalyCount = anomalies.length;
      const alertCount = thresholdAlerts.length;

      const message = sceneSummary
        ? `Segment analyzed: ${sceneSummary}`
        : `Segment analyzed — ${detectionCount} detection(s), ${alertCount} alert(s)`;

      await recordEvent(db, observer, facilityId, deviceId, "cctv:segment:analyzed", "info", message, {
        source: "facilix-processor",
        segmentId,
        detectionCount,
        anomalyCount,
        alertCount,
        detectionCounts,
        sceneSummary,
      });

      // Record threshold alert events for each plugin that crossed its threshold
      for (const alert of thresholdAlerts) {
        const alertMessage = `${alert.pluginName}: ${alert.threshold.count} detected (${alert.threshold.operator} ${alert.threshold.threshold})`;
        await recordEvent(
          db,
          observer,
          facilityId,
          deviceId,
          "cctv:detection:alert",
          (alert.config as WorkflowObjectDetectionDeviceConfig).alertSeverity,
          alertMessage,
          {
            source: "facilix-processor",
            pluginId: alert.pluginId,
            pluginName: alert.pluginName,
            workflowId: alert.workflowId,
            count: alert.threshold.count,
            threshold: alert.threshold.threshold,
            operator: alert.threshold.operator,
            thresholdMode: alert.threshold.thresholdMode,
            segmentId,
            assetId: payload.assetId,
          },
        );
      }
    });

    return {
      detectionCounts,
      detectionCount: allDetections.length,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface PluginDetectionResult {
  pluginId: string;
  pluginName: string;
  workflowId: string;
  config: WorkflowObjectDetectionDeviceConfig;
  detections: WorkflowDetection[];
  detectionCounts: Record<string, number>;
  maxCount: number;
  thresholdAlert: boolean;
  threshold: {
    exceeded: boolean;
    count: number;
    threshold: number;
    operator: string;
    thresholdMode: string;
  };
}

function countByLabel(detections: WorkflowDetection[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of detections) {
    counts[d.label] = (counts[d.label] ?? 0) + 1;
  }
  return counts;
}

function computeCount(detections: WorkflowDetection[], mode: string): number {
  if (mode === "total-detections") {
    return detections.length;
  }

  if (mode === "unique-tracks") {
    const tracks = new Set<string>();
    for (const d of detections) {
      if (d.trackId) tracks.add(d.trackId);
    }
    return tracks.size > 0 ? tracks.size : detections.length;
  }

  // max-per-frame (default): find the frame with the most detections
  if (mode === "max-per-frame") {
    const frameCounts = new Map<number, number>();
    for (const d of detections) {
      const frame = d.frameIndex ?? 0;
      frameCounts.set(frame, (frameCounts.get(frame) ?? 0) + 1);
    }
    let max = 0;
    for (const count of frameCounts.values()) {
      if (count > max) max = count;
    }
    return max;
  }

  return detections.length;
}
