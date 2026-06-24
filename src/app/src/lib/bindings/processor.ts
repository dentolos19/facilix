import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, desc, eq, ne } from "drizzle-orm";

import { analyzeSceneAlerts, summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import { createLogger } from "#/lib/logs";
import {
  countByLabelFilter,
  evaluateCountThreshold,
  evaluateTransition,
  normalizePlugins,
  resolveEnabledPlugins,
  type DetectionAlertRule,
  type SceneMatchAlertRule,
  type SegmentAnalysisDeviceConfig,
  type WorkflowObjectDetectionDeviceConfig,
} from "#/lib/monitoring/plugins";
import { runVideoObjectDetection, type WorkflowDetection } from "#/lib/monitoring/roboflow";
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
 * Object detection is performed for enabled `workflow-object-detection`
 * plugins, each invoking its own Roboflow Workflow. Scene understanding
 * is performed for enabled `segment-understanding` plugins with multiple
 * alert rules per plugin.
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

    // Validate the segment exists without returning the video bytes from a
    // workflow step. Step results are persisted by Cloudflare Workflows and
    // must stay small (currently 1MiB), so the actual bytes are loaded inside
    // the steps that consume them.
    const segmentMetadata = await step.do("load-segment-metadata", STEP_RETRIES, async () => {
      const object = await this.env.BUCKET.head(payload.assetId);
      if (!object) throw new Error(`segment not found in R2: ${payload.assetId}`);
      return { size: object.size };
    });

    // Load previous segment data for enter/leave transition detection
    const previousSegmentData = await step.do<PreviousSegmentData | null>(
      "load-previous-segment",
      STEP_RETRIES,
      async () => {
        return loadPreviousSegmentData(this.env.DATABASE, facilityId, deviceId, segmentId);
      },
    );

    // Run Roboflow workflows for each enabled detection plugin
    const pluginResults: PluginDetectionResult[] = [];
    const allDetections: WorkflowDetection[] = [];
    const detectionCounts: Record<string, number> = {};
    const matchedAlerts: MatchedAlert[] = [];

    for (const detectionPlugin of detectionPlugins) {
      const pluginId = detectionPlugin.plugin.id;
      const pluginWorkflow = detectionPlugin.plugin.workflow;

      if (!pluginWorkflow) {
        this.#log.warn("detection plugin has no workflow config", { pluginId });
        continue;
      }

      const config = detectionPlugin.config as WorkflowObjectDetectionDeviceConfig;
      const classFilter = config.classes && config.classes.length > 0 ? config.classes : undefined;

      const filtered = await step.do<WorkflowDetection[]>(`detect-objects-${pluginId}`, STEP_RETRIES, async () => {
        const segmentBytes = await loadSegmentBytes(this.env.BUCKET, payload.assetId);
        this.#log.info("running Roboflow workflow", {
          pluginId,
          workspace: pluginWorkflow.workspaceName,
          workflow: pluginWorkflow.workflowId,
          segmentSize: segmentBytes.byteLength,
          storedSegmentSize: segmentMetadata.size,
          classFilter: classFilter ?? "all",
        });
        return runVideoObjectDetection({
          segmentBytes,
          pluginWorkflow,
          facilityId,
          minConfidence: config.minConfidence,
          classFilter,
          serverNamespace: this.env.SERVER,
        });
      });

      // Count detections based on threshold mode
      const countValue = computeCount(filtered, config.thresholdMode);

      // Evaluate all alert rules for this plugin
      const pluginAlertResults = evaluateDetectionAlerts(
        filtered,
        countValue,
        config,
        detectionPlugin.plugin.name,
        previousSegmentData,
      );

      pluginResults.push({
        pluginId,
        pluginName: detectionPlugin.plugin.name,
        workflowId: pluginWorkflow.workflowId,
        config,
        detections: filtered,
        detectionCounts: countByLabel(filtered),
        maxCount: countValue,
        matchedAlerts: pluginAlertResults,
      });

      // Collect matched alerts for event recording
      matchedAlerts.push(...pluginAlertResults.filter((a) => a.matched));

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

    // Optional: Run OpenRouter for scene understanding if plugin is enabled
    const sceneResults = await step.do<SceneAnalysisResult[]>("summarize-scene", STEP_RETRIES, async () => {
      const results: SceneAnalysisResult[] = [];

      for (const segmentPlugin of segmentPlugins) {
        const config = segmentPlugin.config as SegmentAnalysisDeviceConfig;
        const alerts = config.alerts.filter((a): a is SceneMatchAlertRule => a.kind === "scene-match" && a.enabled);

        if (alerts.length === 0) {
          // Fall back to plain summary if no scene alerts configured
          try {
            const segmentBytes = await loadSegmentBytes(this.env.BUCKET, payload.assetId);
            const summary = await summarizeVideo(segmentBytes, "video/mp4", config.prompt);
            if (summary) {
              results.push({
                pluginId: segmentPlugin.plugin.id,
                pluginName: segmentPlugin.plugin.name,
                summary,
                alertMatches: [],
              });
            }
          } catch (err) {
            this.#log.error("summarizeVideo failed", {
              error: String(err),
              segmentId: payload.segmentId,
            });
          }
          continue;
        }

        // Build combined prompt with detection context
        const labelList = Object.entries(detectionCounts)
          .map(([label, count]) => `${count}x ${label}`)
          .join(", ");
        const detectionContext = labelList ? `\n\nDetected objects in this segment: ${labelList}` : "";

        try {
          const segmentBytes = await loadSegmentBytes(this.env.BUCKET, payload.assetId);
          const alertDescriptions = alerts.map((a) => a.description);
          const analysis = await analyzeSceneAlerts(segmentBytes, "video/mp4", alertDescriptions, detectionContext);

          if (analysis) {
            results.push({
              pluginId: segmentPlugin.plugin.id,
              pluginName: segmentPlugin.plugin.name,
              summary: analysis.summary,
              alertMatches: analysis.matches.map((m) => ({
                description: m.description,
                matched: m.matched,
                confidence: m.confidence,
                evidence: m.evidence,
                severity: alerts.find((a) => a.description === m.description)?.severity ?? "warn",
              })),
            });

            // Collect matched scene alerts for event recording
            for (const match of analysis.matches) {
              if (match.matched) {
                const rule = alerts.find((a) => a.description === match.description);
                if (rule) {
                  matchedAlerts.push({
                    kind: "scene-match",
                    matched: true,
                    pluginId: segmentPlugin.plugin.id,
                    pluginName: segmentPlugin.plugin.name,
                    description: rule.description,
                    severity: rule.severity,
                    confidence: match.confidence,
                    evidence: match.evidence,
                  });
                }
              }
            }
          }
        } catch (err) {
          this.#log.error("analyzeSceneAlerts failed", {
            error: String(err),
            segmentId: payload.segmentId,
            pluginId: segmentPlugin.plugin.id,
          });
        }
      }

      return results;
    });

    // Persist results to video_segments.data
    await step.do("persist", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);

      const data = {
        source: "facilix-processor",
        analysisVersion: 6,
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
          matchedAlerts: r.matchedAlerts,
        })),
        sceneResults,
        matchedAlerts: matchedAlerts.map((a) => ({
          kind: a.kind,
          pluginId: a.pluginId,
          pluginName: a.pluginName,
          severity: a.severity,
          description: "description" in a ? a.description : undefined,
          count: "count" in a ? a.count : undefined,
          threshold: "threshold" in a ? a.threshold : undefined,
          operator: "operator" in a ? a.operator : undefined,
          confidence: a.confidence,
          evidence: a.evidence,
        })),
        analyzedAt: new Date().toISOString(),
      };

      await db.update(schema.videoSegment).set({ data }).where(eq(schema.videoSegment.id, segmentId));

      const observer = this.env.OBSERVER.getByName(facilityId);
      const detectionCount = allDetections.length;
      const anomalyCount = anomalies.length;
      const alertCount = matchedAlerts.length;

      const summaryText = sceneResults.find((r) => r.summary)?.summary;
      const message = summaryText
        ? `Segment analyzed: ${summaryText}`
        : `Segment analyzed — ${detectionCount} detection(s), ${alertCount} alert(s)`;

      await recordEvent(db, observer, facilityId, deviceId, "cctv:segment:analyzed", "info", message, {
        source: "facilix-processor",
        segmentId,
        detectionCount,
        anomalyCount,
        alertCount,
        detectionCounts,
        sceneSummary: summaryText,
      });

      // Record alert events for each matched alert
      for (const alert of matchedAlerts) {
        let alertMessage: string;
        if (alert.kind === "scene-match") {
          alertMessage = `${alert.pluginName}: Scene matched — "${alert.description}"`;
        } else if (alert.kind === "object-enters") {
          const labels = alert.matchedLabels?.length ? ` (${alert.matchedLabels.join(", ")})` : "";
          alertMessage = `${alert.pluginName}: Object(s) entered${labels}`;
        } else if (alert.kind === "object-leaves") {
          const labels = alert.matchedLabels?.length ? ` (${alert.matchedLabels.join(", ")})` : "";
          alertMessage = `${alert.pluginName}: Object(s) left${labels}`;
        } else {
          alertMessage = `${alert.pluginName}: ${alert.count} detected (${alert.operator} ${alert.threshold})`;
        }

        await recordEvent(db, observer, facilityId, deviceId, "cctv:detection:alert", alert.severity, alertMessage, {
          source: "facilix-processor",
          pluginId: alert.pluginId,
          pluginName: alert.pluginName,
          alertKind: alert.kind,
          count: "count" in alert ? alert.count : undefined,
          threshold: "threshold" in alert ? alert.threshold : undefined,
          operator: "operator" in alert ? alert.operator : undefined,
          confidence: alert.confidence,
          evidence: alert.evidence,
          segmentId,
          assetId: payload.assetId,
        });
      }
    });

    return {
      detectionCounts,
      detectionCount: allDetections.length,
    };
  }
}

// ── Alert evaluation ─────────────────────────────────────────────────────

interface MatchedAlert {
  kind: DetectionAlertRule["kind"] | "scene-match";
  matched: boolean;
  pluginId: string;
  pluginName: string;
  severity: import("#/lib/monitoring/plugins").AlertSeverity;
  /** For count-threshold alerts */
  count?: number;
  threshold?: number;
  operator?: string;
  thresholdMode?: string;
  /** For object-enters/object-leaves */
  matchedLabels?: string[];
  /** For scene-match */
  description?: string;
  confidence?: number;
  evidence?: Array<{
    label: string;
    confidence: number;
    box?: { xmin: number; ymin: number; xmax: number; ymax: number };
  }>;
}

function evaluateDetectionAlerts(
  detections: WorkflowDetection[],
  countValue: number,
  config: WorkflowObjectDetectionDeviceConfig,
  pluginName: string,
  previousData: PreviousSegmentData | null,
): MatchedAlert[] {
  const results: MatchedAlert[] = [];
  const pluginId = config.pluginId;

  for (const rule of config.alerts) {
    if (!rule.enabled) continue;

    if (rule.kind === "count-threshold") {
      const thresholdResult = evaluateCountThreshold(countValue, rule);
      results.push({
        kind: "count-threshold",
        matched: thresholdResult.exceeded,
        pluginId,
        pluginName,
        severity: rule.severity,
        count: thresholdResult.count,
        threshold: thresholdResult.threshold,
        operator: thresholdResult.operator,
        thresholdMode: thresholdResult.thresholdMode,
      });
      continue;
    }

    if (rule.kind === "object-enters" || rule.kind === "object-leaves") {
      const currentCount = countByLabelFilter(
        detections.map((d) => ({ label: d.label })),
        rule.labels,
      );
      const prevCount = previousData?.detectionCounts
        ? countByLabelWithFilter(previousData.detectionCounts, rule.labels)
        : null;

      const matched = evaluateTransition(currentCount, prevCount, rule.kind);
      const matchedLabels = rule.labels && rule.labels.length > 0 ? rule.labels : undefined;

      results.push({
        kind: rule.kind,
        matched,
        pluginId,
        pluginName,
        severity: rule.severity,
        matchedLabels,
      });
    }
  }

  return results;
}

function countByLabelWithFilter(counts: Record<string, number>, labels?: string[]): number {
  if (!labels || labels.length === 0) {
    return Object.values(counts).reduce((sum, c) => sum + c, 0);
  }
  const labelSet = new Set(labels.map((l) => l.toLowerCase()));
  return Object.entries(counts)
    .filter(([label]) => labelSet.has(label.toLowerCase()))
    .reduce((sum, [, c]) => sum + c, 0);
}

// ── Scene analysis types ────────────────────────────────────────────────

interface SceneAnalysisResult {
  pluginId: string;
  pluginName: string;
  summary: string | null;
  alertMatches: Array<{
    description: string;
    matched: boolean;
    confidence?: number;
    evidence?: Array<{
      label: string;
      confidence: number;
      box?: { xmin: number; ymin: number; xmax: number; ymax: number };
    }>;
    severity: import("#/lib/monitoring/plugins").AlertSeverity;
  }>;
}

// ── Previous segment data ───────────────────────────────────────────────

interface PreviousSegmentData {
  detectionCounts: Record<string, number>;
}

async function loadPreviousSegmentData(
  database: D1Database,
  facilityId: string,
  deviceId: string,
  currentSegmentId: string,
): Promise<PreviousSegmentData | null> {
  const db = createDatabase(database);
  const [prev] = await db
    .select({ data: schema.videoSegment.data })
    .from(schema.videoSegment)
    .where(
      and(
        eq(schema.videoSegment.facilityId, facilityId),
        eq(schema.videoSegment.deviceId, deviceId),
        ne(schema.videoSegment.id, currentSegmentId),
      ),
    )
    .orderBy(desc(schema.videoSegment.startedAt))
    .limit(1);

  if (!prev) return null;
  const prevData = prev.data as JsonObject | undefined;
  if (!prevData) return null;

  const counts = prevData.detectionCounts;
  if (counts && typeof counts === "object") {
    return { detectionCounts: counts as Record<string, number> };
  }

  return null;
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
  matchedAlerts: MatchedAlert[];
}

async function loadSegmentBytes(bucket: R2Bucket, assetId: string): Promise<Uint8Array> {
  const object = await bucket.get(assetId);
  if (!object) throw new Error(`segment not found in R2: ${assetId}`);
  return object.bytes();
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
