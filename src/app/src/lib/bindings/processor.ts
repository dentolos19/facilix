import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, desc, eq, ne } from "drizzle-orm";

import { analyzeSceneAlerts, summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import { createLogger } from "#/lib/logs";
import { selectRepresentativeFrames, type StoredPredictionOutputRef } from "#/lib/monitoring/event-evidence";
import {
  countByLabelFilter,
  evaluateCountThreshold,
  evaluateTransition,
  getPlugin,
  isCooldownElapsed,
  normalizePlugins,
  resolveEnabledPlugins,
  type DetectionAlertRule,
  type PluginCategory,
  type SceneMatchAlertRule,
  type SegmentAnalysisDeviceConfig,
  type SegmentUnderstandingPlugin,
  type WorkflowObjectDetectionPlugin,
  type WorkflowObjectDetectionDeviceConfig,
} from "#/lib/monitoring/plugins";
import {
  runVideoObjectDetection,
  type DetectionVideoMeta,
  type PredictionOutputFrame,
  type WorkflowDetection,
} from "#/lib/monitoring/roboflow";
import { recordEvent, type EventAttachmentInput } from "#/lib/monitoring/utils";
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
    const detectionPlugins: Array<{
      plugin: WorkflowObjectDetectionPlugin;
      config: WorkflowObjectDetectionDeviceConfig;
    }> = [];
    const segmentPlugins: Array<{
      plugin: SegmentUnderstandingPlugin;
      config: SegmentAnalysisDeviceConfig;
    }> = [];
    const cooldownByPlugin = new Map<string, number>();

    await step.do("load-device-plugins", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);
      const [row] = await db
        .select({ data: schema.facilityDevice.data })
        .from(schema.facilityDevice)
        .where(eq(schema.facilityDevice.id, deviceId))
        .limit(1);
      const configs = normalizePlugins((row?.data as JsonObject | undefined)?.plugins);
      const enabled = resolveEnabledPlugins(configs);
      for (const resolved of enabled) {
        cooldownByPlugin.set(resolved.plugin.id, resolved.config.cooldownSec ?? 0);
        if (resolved.kind === "workflow-object-detection") {
          detectionPlugins.push(resolved);
        } else {
          segmentPlugins.push(resolved);
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
    let detectionVideo: DetectionVideoMeta | null = null;

    for (const detectionPlugin of detectionPlugins) {
      const pluginId = detectionPlugin.plugin.id;
      const pluginWorkflow = detectionPlugin.plugin.workflow;

      if (!pluginWorkflow) {
        this.#log.warn("detection plugin has no workflow config", { pluginId });
        continue;
      }

      const config = detectionPlugin.config;
      const classFilter = config.classes && config.classes.length > 0 ? config.classes : undefined;

      const result = await step.do(`detect-objects-${pluginId}`, STEP_RETRIES, async () => {
        const segmentBytes = await loadSegmentBytes(this.env.BUCKET, payload.assetId);
        this.#log.info("running Roboflow workflow", {
          pluginId,
          workspace: pluginWorkflow.workspaceName,
          workflow: pluginWorkflow.workflowId,
          segmentSize: segmentBytes.byteLength,
          storedSegmentSize: segmentMetadata.size,
          classFilter: classFilter ?? "all",
        });
        const result = await runVideoObjectDetection({
          segmentBytes,
          pluginWorkflow,
          facilityId,
          minConfidence: config.minConfidence,
          classFilter,
          serverNamespace: this.env.SERVER,
          roboflowApiKey: this.env.ROBOFLOW_API_KEY,
          roboflowApiBase: "https://serverless.roboflow.com",
        });

        const storedPredictionOutputs =
          result.predictionOutputs.length > 0
            ? await persistPredictionOutputs({
                database: this.env.DATABASE,
                bucket: this.env.BUCKET,
                segmentId,
                facilityId,
                deviceId,
                pluginId,
                workflowId: pluginWorkflow.workflowId,
                frames: result.predictionOutputs,
              })
            : [];

        // Never return base64 image payloads from a Workflow step. Workflows
        // serializes step outputs and has a 32MiB serialized value limit.
        return {
          detections: result.detections,
          predictionOutputs: [],
          storedPredictionOutputs,
          video: result.video,
        };
      });

      const filtered = result.detections;

      // Capture video metadata from the first detection plugin
      if (!detectionVideo && result.video) {
        detectionVideo = result.video;
      }

      // Count detections based on threshold mode
      const countValue = computeCount(filtered, config.thresholdMode);

      // Evaluate all alert rules for this plugin
      const pluginAlertResults = evaluateDetectionAlerts(
        filtered,
        countValue,
        config,
        detectionPlugin.plugin,
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
        operationalState: deriveDetectionOperationalState(pluginId, countValue),
        storedPredictionOutputs: result.storedPredictionOutputs,
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
        const config = segmentPlugin.config;
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
                category: segmentPlugin.plugin.category,
                summary,
                operationalState: "normal",
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
              category: segmentPlugin.plugin.category,
              summary: analysis.summary,
              operationalState: analysis.matches.some((match) => match.matched) ? "attention" : "normal",
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
                    category: segmentPlugin.plugin.category,
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

    const evaluatedAt = new Date(payload.endedAt || payload.startedAt);
    const cooldownResult = applyAlertCooldown(
      matchedAlerts,
      cooldownByPlugin,
      previousSegmentData?.alertState ?? {},
      Number.isNaN(evaluatedAt.getTime()) ? new Date() : evaluatedAt,
    );
    const emittedAlerts = cooldownResult.alerts;

    // Persist results to video_segments.data
    await step.do("persist", STEP_RETRIES, async () => {
      const db = createDatabase(this.env.DATABASE);

      const data = {
        source: "facilix-processor",
        analysisVersion: 9,
        detectionVideo,
        detections: allDetections.map((d) => ({
          label: d.label,
          confidence: d.confidence,
          box: d.box,
          atSec: d.atSec,
          frameIndex: d.frameIndex,
          trackId: d.trackId,
          classId: d.classId,
          prediction: d.prediction,
          image: d.image,
        })),
        detectionCounts,
        anomalies,
        pluginResults: pluginResults.map((r) => ({
          pluginId: r.pluginId,
          pluginName: r.pluginName,
          workflowId: r.workflowId,
          detectionCounts: r.detectionCounts,
          maxCount: r.maxCount,
          operationalState: r.operationalState,
          matchedAlerts: r.matchedAlerts,
        })),
        sceneResults,
        matchedAlerts: emittedAlerts.map((a) => ({
          kind: a.kind,
          pluginId: a.pluginId,
          pluginName: a.pluginName,
          category: a.category,
          severity: a.severity,
          description: "description" in a ? a.description : undefined,
          count: "count" in a ? a.count : undefined,
          threshold: "threshold" in a ? a.threshold : undefined,
          operator: "operator" in a ? a.operator : undefined,
          confidence: a.confidence,
          evidence: a.evidence,
        })),
        alertState: cooldownResult.alertState,
        analyzedAt: new Date().toISOString(),
      };

      await db.update(schema.videoSegment).set({ data }).where(eq(schema.videoSegment.id, segmentId));

      const observer = this.env.OBSERVER.getByName(facilityId);
      const detectionCount = allDetections.length;
      const anomalyCount = anomalies.length;
      const alertCount = emittedAlerts.length;

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
      for (const alert of emittedAlerts) {
        const alertMessage = formatAlertMessage(alert);
        const plugin = getPlugin(alert.pluginId);
        const detectionResult = pluginResults.find((result) => result.pluginId === alert.pluginId);
        const segmentConfig = segmentPlugins.find((entry) => entry.plugin.id === alert.pluginId)?.config;
        const evidenceConfig = detectionResult?.config.evidence ?? segmentConfig?.evidence;
        const eventAttachments = buildAlertAttachments(
          payload,
          alert,
          detectionResult,
          evidenceConfig ?? { attachVideo: true, attachAnnotatedFrames: false, maxAnnotatedFrames: 0 },
        );

        await recordEvent(
          db,
          observer,
          facilityId,
          deviceId,
          "cctv:detection:alert",
          alert.severity,
          alertMessage,
          {
            source: "facilix-processor",
            pluginId: alert.pluginId,
            pluginName: alert.pluginName,
            category: alert.category,
            alertKind: alert.kind,
            description: plugin?.description,
            reason: formatAlertReason(alert),
            recommendedAction: plugin?.recommendedAction,
            count: "count" in alert ? alert.count : undefined,
            threshold: "threshold" in alert ? alert.threshold : undefined,
            operator: "operator" in alert ? alert.operator : undefined,
            thresholdMode: "thresholdMode" in alert ? alert.thresholdMode : undefined,
            matchedLabels: alert.matchedLabels,
            confidence: alert.confidence,
            evidence: alert.evidence,
            segmentId,
            assetId: payload.assetId,
            durationSec: payload.durationSec,
          },
          eventAttachments,
        );
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
  category: PluginCategory;
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
  plugin: WorkflowObjectDetectionPlugin,
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
        pluginName: plugin.name,
        category: plugin.category,
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
        pluginName: plugin.name,
        category: plugin.category,
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
  category: PluginCategory;
  summary: string | null;
  operationalState: "normal" | "attention";
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
  alertState: Record<string, string>;
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

  return {
    detectionCounts: normalizeCountRecord(prevData.detectionCounts),
    alertState: normalizeStringRecord(prevData.alertState),
  };
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
  operationalState: string;
  storedPredictionOutputs: StoredPredictionOutputRef[];
  matchedAlerts: MatchedAlert[];
}

function buildAlertAttachments(
  payload: SegmentPayload,
  alert: MatchedAlert,
  detectionResult: PluginDetectionResult | undefined,
  config: { attachVideo: boolean; attachAnnotatedFrames: boolean; maxAnnotatedFrames: number },
): EventAttachmentInput[] {
  const selectedFrames =
    config.attachAnnotatedFrames && detectionResult
      ? selectRepresentativeFrames(
          detectionResult.storedPredictionOutputs,
          detectionResult.detections,
          { kind: alert.kind, labels: alert.matchedLabels },
          config.maxAnnotatedFrames,
        )
      : [];
  const attachments: EventAttachmentInput[] = selectedFrames.map((frame, index) => {
    const detections = detectionResult?.detections.filter((item) => item.frameIndex === frame.frameIndex) ?? [];
    return {
      assetId: frame.afterAssetId,
      kind: "image",
      variant: "annotated-frame",
      role: index === 0 ? "primary" : "supporting",
      sortOrder: index,
      metadata: {
        segmentId: payload.segmentId,
        pluginId: alert.pluginId,
        frameIndex: frame.frameIndex,
        atSec: frame.atSec,
        labels: detections.length > 0 ? [...new Set(detections.map((item) => item.label))] : (frame.labels ?? []),
        predictionCount: detections.length || frame.predictionCount || 0,
        confidence:
          detections.length > 0 ? Math.max(...detections.map((item) => item.confidence)) : frame.maxConfidence,
        detections: detections.slice(0, 10).map((item) => ({
          label: item.label,
          confidence: item.confidence,
          box: item.box,
        })),
      },
    };
  });

  if (config.attachVideo) {
    attachments.push({
      assetId: payload.assetId,
      kind: "video",
      variant: "source-segment",
      role: selectedFrames.length === 0 ? "primary" : "source",
      sortOrder: selectedFrames.length,
      metadata: {
        segmentId: payload.segmentId,
        pluginId: alert.pluginId,
        durationSec: payload.durationSec,
      },
    });
  }

  return attachments;
}

function normalizeCountRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (typeof count === "number" && Number.isFinite(count)) counts[key] = count;
  }
  return counts;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const strings: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") strings[key] = entry;
  }
  return strings;
}

function deriveDetectionOperationalState(pluginId: string, count: number): string {
  if (pluginId === "restricted-area-protection") return count > 0 ? "breach" : "clear";
  if (pluginId === "loading-bay-operations") return count > 0 ? "occupied" : "available";
  return count > 0 ? "active" : "clear";
}

function alertStateKey(alert: MatchedAlert): string {
  if (alert.kind === "scene-match") {
    return `${alert.pluginId}:scene-match:${alert.description ?? ""}`;
  }
  if (alert.kind === "count-threshold") {
    return `${alert.pluginId}:count-threshold:${alert.operator ?? ""}:${alert.threshold ?? ""}:${alert.thresholdMode ?? ""}`;
  }
  return `${alert.pluginId}:${alert.kind}:${[...(alert.matchedLabels ?? [])].sort().join(",")}`;
}

function applyAlertCooldown(
  alerts: MatchedAlert[],
  cooldownByPlugin: Map<string, number>,
  previousAlertState: Record<string, string>,
  now: Date,
): { alerts: MatchedAlert[]; alertState: Record<string, string> } {
  const alertState = { ...previousAlertState };
  const emitted: MatchedAlert[] = [];

  for (const alert of alerts) {
    if (!alert.matched) continue;
    const key = alertStateKey(alert);
    const cooldownSec = Math.max(0, cooldownByPlugin.get(alert.pluginId) ?? 0);
    if (!isCooldownElapsed(previousAlertState[key], cooldownSec, now)) continue;
    emitted.push(alert);
    alertState[key] = now.toISOString();
  }

  return { alerts: emitted, alertState };
}

function formatAlertMessage(alert: MatchedAlert): string {
  if (alert.kind === "scene-match") {
    return `${alert.pluginName}: ${alert.description ?? "operational risk detected"}`;
  }
  if (alert.pluginId === "loading-bay-operations") {
    if (alert.kind === "object-enters") return `${alert.pluginName}: vehicle arrived`;
    if (alert.kind === "object-leaves") return `${alert.pluginName}: vehicle departed`;
    return `${alert.pluginName}: possible congestion — ${alert.count ?? 0} vehicles detected`;
  }
  if (alert.pluginId === "restricted-area-protection") {
    if (alert.kind === "object-enters") return `${alert.pluginName}: person entered the monitored area`;
    return `${alert.pluginName}: ${alert.count ?? 0} person(s) visible in the monitored area`;
  }
  if (alert.kind === "object-enters") return `${alert.pluginName}: monitored object entered`;
  if (alert.kind === "object-leaves") return `${alert.pluginName}: monitored object left`;
  return `${alert.pluginName}: ${alert.count ?? 0} detection(s) matched the configured limit`;
}

function formatAlertReason(alert: MatchedAlert): string {
  if (alert.kind === "scene-match") return alert.description ?? "The configured visual condition matched.";
  if (alert.kind === "object-enters") {
    return `${alert.matchedLabels?.join(", ") || "A monitored object"} entered the camera view.`;
  }
  if (alert.kind === "object-leaves") {
    return `${alert.matchedLabels?.join(", ") || "A monitored object"} left the camera view.`;
  }
  return `The measured count ${alert.count ?? 0} matched ${alert.operator ?? "the limit"} ${alert.threshold ?? 0}.`;
}

async function loadSegmentBytes(bucket: R2Bucket, assetId: string): Promise<Uint8Array> {
  const object = await bucket.get(assetId);
  if (!object) throw new Error(`segment not found in R2: ${assetId}`);
  return object.bytes();
}

async function persistPredictionOutputs({
  database,
  bucket,
  segmentId,
  facilityId,
  deviceId,
  pluginId,
  workflowId,
  frames,
}: {
  database: D1Database;
  bucket: R2Bucket;
  segmentId: string;
  facilityId: string;
  deviceId: string;
  pluginId: string;
  workflowId: string;
  frames: PredictionOutputFrame[];
}): Promise<StoredPredictionOutputRef[]> {
  const db = createDatabase(database);
  const outputName = "predictions";
  const stored: StoredPredictionOutputRef[] = [];

  for (const frame of frames) {
    const frameIndex = frame.frameIndex;
    const beforeKey = `prediction-outputs/${segmentId}/${pluginId}/${workflowId}/${frameIndex}/before.jpg`;
    const afterKey = `prediction-outputs/${segmentId}/${pluginId}/${workflowId}/${frameIndex}/after.jpg`;
    const beforeBytes = base64ToArrayBuffer(frame.beforeImage);
    const afterBytes = base64ToArrayBuffer(frame.afterImage);
    const beforeName = `${segmentId}-frame-${frameIndex}-before.jpg`;
    const afterName = `${segmentId}-frame-${frameIndex}-after.jpg`;

    await bucket.put(beforeKey, beforeBytes, {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { name: beforeName },
    });
    await db
      .insert(schema.asset)
      .values({
        id: beforeKey,
        name: beforeName,
        type: "image/jpeg",
        size: beforeBytes.byteLength,
        hash: "",
      })
      .onConflictDoUpdate({
        target: schema.asset.id,
        set: {
          size: beforeBytes.byteLength,
          updatedAt: new Date(),
        },
      });

    await bucket.put(afterKey, afterBytes, {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: { name: afterName },
    });
    await db
      .insert(schema.asset)
      .values({
        id: afterKey,
        name: afterName,
        type: "image/jpeg",
        size: afterBytes.byteLength,
        hash: "",
      })
      .onConflictDoUpdate({
        target: schema.asset.id,
        set: {
          size: afterBytes.byteLength,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(schema.predictionOutput)
      .values({
        beforeAssetId: beforeKey,
        afterAssetId: afterKey,
        segmentId,
        facilityId,
        deviceId,
        pluginId,
        workflowId,
        outputName,
        frameIndex,
        atSec: frame.atSec,
        predictions: frame.predictions as unknown as Record<string, unknown>[],
        image: frame.image,
      })
      .onConflictDoUpdate({
        target: [
          schema.predictionOutput.segmentId,
          schema.predictionOutput.pluginId,
          schema.predictionOutput.workflowId,
          schema.predictionOutput.outputName,
          schema.predictionOutput.frameIndex,
        ],
        set: {
          beforeAssetId: beforeKey,
          afterAssetId: afterKey,
          predictions: frame.predictions as unknown as Record<string, unknown>[],
          image: frame.image,
        },
      });
    stored.push({
      beforeAssetId: beforeKey,
      afterAssetId: afterKey,
      frameIndex,
      atSec: frame.atSec,
      predictionCount: frame.predictions.length,
      labels: [...new Set(frame.predictions.map((prediction) => prediction.label))],
      maxConfidence:
        frame.predictions.length > 0
          ? Math.max(...frame.predictions.map((prediction) => prediction.confidence))
          : undefined,
    });
  }
  return stored;
}

function countByLabel(detections: WorkflowDetection[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of detections) {
    counts[d.label] = (counts[d.label] ?? 0) + 1;
  }
  return counts;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
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
