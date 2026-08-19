import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { and, desc, eq, ne } from "drizzle-orm";

import { analyzeSceneAlerts, summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import { createLogger } from "#/lib/logs";
import { selectRepresentativeFrames, type StoredDetectionRef } from "#/lib/monitoring/event-evidence";
import {
  countByLabelFilter,
  evaluateCountThreshold,
  evaluateTransition,
  filterDetectionsForPlugin,
  getPlugin,
  groupPluginsByWorkflow,
  isCooldownElapsed,
  normalizePlugins,
  resolveEnabledPlugins,
  workflowIdentity,
  type DetectionAlertRule,
  type DevicePluginConfig,
  type PluginCategory,
  type ResolvedPlugin,
  type SceneMatchAlertRule,
  type WorkflowObjectDetectionPlugin,
  type WorkflowObjectDetectionDeviceConfig,
} from "#/lib/monitoring/plugins";
import {
  runVideoObjectDetection,
  type DetectionVideoMeta,
  type DetectionFrame,
  type WorkflowDetection,
} from "#/lib/monitoring/roboflow";
import { recordEvent, type EventAttachmentInput } from "#/lib/monitoring/utils";
import type { JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

/**
 * Durable processor for CCTV video segments.
 *
 * Segment uploads are persisted to R2 by the HTTP handlers
 * (`monitoring/api.ts`), then the workflow is dispatched with a JSON pointer
 * (`assetId` + metadata). External inference and DB writes run inside durable
 * `step.do` boundaries.
 *
 * Enabled plugins are grouped by Roboflow workflow so each distinct workflow
 * runs once per segment. Vision-language plugins then review the complete
 * source video segment.
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
  processId: string;
};

export type ProcessorPayload = SegmentPayload;

const STEP_RETRIES = {
  retries: { limit: 3, delay: "5 seconds" as const, backoff: "exponential" as const },
  timeout: "3 minutes" as const,
};

type FacilityProcessStatus =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "errored"
  | "terminated"
  | "complete"
  | "unknown";

type FacilityProcessUpdate = {
  status?: FacilityProcessStatus;
  step?: string | null;
  attempt?: number | null;
  error?: { name: string; message: string } | null;
  output?: JsonObject | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

function toProcessError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "WorkflowError", message: String(error) };
}

export class Processor extends WorkflowEntrypoint<Env, ProcessorPayload> {
  #log = createLogger("processor");

  async run(event: WorkflowEvent<ProcessorPayload>, step: WorkflowStep): Promise<unknown> {
    const { payload } = event;
    await this.startProcess(payload.processId);
    try {
      const result = await this.runSegment(payload, step);
      await this.updateProcess(payload.processId, {
        status: "complete",
        output: result,
        completedAt: new Date(),
      });
      return result;
    } catch (error) {
      await this.updateProcess(payload.processId, {
        status: "errored",
        error: toProcessError(error),
        completedAt: new Date(),
      });
      throw error;
    }
  }

  private async updateProcess(processId: string, update: FacilityProcessUpdate) {
    const db = createDatabase(this.env.DATABASE);
    await db
      .update(schema.facilityProcess)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.facilityProcess.id, processId));
  }

  private async startProcess(processId: string) {
    const db = createDatabase(this.env.DATABASE);
    const [process] = await db
      .select({ startedAt: schema.facilityProcess.startedAt })
      .from(schema.facilityProcess)
      .where(eq(schema.facilityProcess.id, processId))
      .limit(1);
    await this.updateProcess(processId, {
      status: "running",
      startedAt: process?.startedAt ?? new Date(),
      error: null,
    });
  }

  private async beginStep(processId: string, stepName: string, attempt: number) {
    await this.updateProcess(processId, {
      status: "running",
      step: stepName,
      attempt,
      error: null,
    });
  }

  // ── Segment processing ────────────────────────────────────────────────────

  private async runSegment(
    payload: SegmentPayload,
    step: WorkflowStep,
  ): Promise<{ detectionCounts: Record<string, number>; detectionCount: number }> {
    const { facilityId, deviceId, segmentId } = payload;

    // Load all enabled plugins for this device
    const resolvedPlugins = await step.do<ResolvedPlugin[]>("load-plugins", STEP_RETRIES, async (context) => {
      await this.beginStep(payload.processId, context.step.name, context.attempt);
      const db = createDatabase(this.env.DATABASE);
      const [row] = await db
        .select({ data: schema.facilityDevice.data })
        .from(schema.facilityDevice)
        .where(eq(schema.facilityDevice.id, deviceId))
        .limit(1);
      const configs = normalizePlugins((row?.data as JsonObject | undefined)?.plugins);
      return resolveEnabledPlugins(configs);
    });
    const segmentPlugins = resolvedPlugins.filter(
      (resolved): resolved is Extract<ResolvedPlugin, { kind: "segment-understanding" }> =>
        resolved.kind === "segment-understanding",
    );
    const cooldownByPlugin = new Map(
      resolvedPlugins.map((resolved) => [resolved.plugin.id, resolved.config.cooldownSec ?? 0]),
    );
    const workflowGroups = groupPluginsByWorkflow(resolvedPlugins);

    // Validate the segment exists without returning the video bytes from a
    // workflow step. Step results are persisted by Cloudflare Workflows and
    // must stay small (currently 1MiB), so the actual bytes are loaded inside
    // the steps that consume them.
    const segmentMetadata = await step.do("load-metadata", STEP_RETRIES, async (context) => {
      await this.beginStep(payload.processId, context.step.name, context.attempt);
      const object = await this.env.BUCKET.head(payload.assetId);
      if (!object) throw new Error(`segment not found in R2: ${payload.assetId}`);
      return {
        size: object.size,
        contentType: object.httpMetadata?.contentType?.startsWith("video/")
          ? object.httpMetadata.contentType
          : "video/mp4",
      };
    });

    // Load previous segment data for enter/leave transition detection
    const previousSegmentData = await step.do<PreviousSegmentData | null>(
      "load-previous-segment",
      STEP_RETRIES,
      async (context) => {
        await this.beginStep(payload.processId, context.step.name, context.attempt);
        return loadPreviousSegmentData(this.env.DATABASE, facilityId, deviceId, segmentId);
      },
    );

    // Run each distinct Roboflow workflow once, then fan its results out to
    // every plugin that uses it.
    const pluginResults: PluginDetectionResult[] = [];
    const allDetections: WorkflowDetection[] = [];
    const detectionCounts: Record<string, number> = {};
    const matchedAlerts: MatchedAlert[] = [];
    let detectionVideo: DetectionVideoMeta | null = null;

    for (const [groupIndex, group] of workflowGroups.entries()) {
      const stepName = `detect-${sanitizeWorkflowKey(group.workflow.workflowId)}-${groupIndex}`;
      const result = await step.do(stepName, STEP_RETRIES, async (context) => {
        await this.beginStep(payload.processId, context.step.name, context.attempt);
        const segmentBytes = await loadSegmentBytes(this.env.BUCKET, payload.assetId);
        this.#log.info("running Roboflow workflow", {
          pluginIds: group.plugins.map((entry) => entry.plugin.id),
          workspace: group.workflow.workspaceName,
          workflow: group.workflow.workflowId,
          segmentSize: segmentBytes.byteLength,
          storedSegmentSize: segmentMetadata.size,
          classFilter: group.classFilter ?? "all",
        });
        const workflowResult = await runVideoObjectDetection({
          segmentBytes,
          pluginWorkflow: group.workflow,
          facilityId,
          minConfidence: group.minConfidence,
          classFilter: group.classFilter,
          serverNamespace: this.env.SERVER,
          roboflowApiKey: this.env.ROBOFLOW_API_KEY,
          roboflowApiBase: "https://serverless.roboflow.com",
        });

        const storedDetectionOutputsByPlugin =
          workflowResult.detectionOutputs.length > 0
            ? await persistDetectionOutputs({
                database: this.env.DATABASE,
                bucket: this.env.BUCKET,
                segmentId,
                facilityId,
                deviceId,
                workflow: group.workflow,
                plugins: group.plugins.map((entry) => ({
                  pluginId: entry.plugin.id,
                  config: entry.config,
                })),
                frames: workflowResult.detectionOutputs,
              })
            : {};

        // Never return base64 image payloads from a Workflow step. Workflows
        // persists non-stream step outputs with a 1 MiB limit.
        return {
          detections: workflowResult.detections,
          storedDetectionOutputsByPlugin,
          video: workflowResult.video,
        };
      });

      // Capture video metadata from the first workflow.
      if (!detectionVideo && result.video) {
        detectionVideo = result.video;
      }

      // Aggregate each workflow result once, even when multiple plugins share it.
      for (const [label, count] of Object.entries(countByLabel(result.detections))) {
        detectionCounts[label] = (detectionCounts[label] ?? 0) + count;
      }
      allDetections.push(...result.detections);

      for (const resolved of group.plugins) {
        const filtered = filterDetectionsForPlugin(result.detections, resolved.config);
        const countMode =
          resolved.config.kind === "workflow-object-detection" ? resolved.config.thresholdMode : "max-per-frame";
        const countValue = computeCount(filtered, countMode);
        const pluginAlertResults =
          resolved.kind === "workflow-object-detection"
            ? evaluateDetectionAlerts(filtered, countValue, resolved.config, resolved.plugin, previousSegmentData)
            : [];

        pluginResults.push({
          pluginId: resolved.plugin.id,
          pluginName: resolved.plugin.name,
          workflowId: group.workflow.workflowId,
          config: resolved.config,
          detections: filtered,
          detectionCounts: countByLabel(filtered),
          maxCount: countValue,
          operationalState: deriveDetectionOperationalState(resolved.plugin.id, countValue),
          storedDetectionOutputs: result.storedDetectionOutputsByPlugin[resolved.plugin.id] ?? [],
          matchedAlerts: pluginAlertResults,
        });
        matchedAlerts.push(...pluginAlertResults.filter((alert) => alert.matched));
      }
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

    // Run optional vision-language analysis against the complete source video.
    const sceneResults = await step.do<SceneAnalysisResult[]>("analyze-segment", STEP_RETRIES, async (context) => {
      await this.beginStep(payload.processId, context.step.name, context.attempt);
      const results: SceneAnalysisResult[] = [];
      if (segmentPlugins.length === 0) return results;

      const segmentBytes = await loadSegmentBytes(this.env.BUCKET, payload.assetId);

      for (const segmentPlugin of segmentPlugins) {
        const config = segmentPlugin.config;
        const alerts = config.alerts.filter((a): a is SceneMatchAlertRule => a.kind === "scene-match" && a.enabled);
        const detectionResult = pluginResults.find((result) => result.pluginId === segmentPlugin.plugin.id);
        const roboflowContext = buildRoboflowVideoContext(detectionResult, detectionVideo);

        if (alerts.length === 0) {
          try {
            const summary = await summarizeVideo(
              segmentBytes,
              segmentMetadata.contentType,
              `${config.prompt}${roboflowContext}`,
              { maxTokens: 800 },
            );
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
              pluginId: segmentPlugin.plugin.id,
            });
          }
          continue;
        }

        try {
          const alertDescriptions = alerts.map((a) => a.description);
          const analysis = await analyzeSceneAlerts(
            segmentBytes,
            segmentMetadata.contentType,
            alertDescriptions,
            roboflowContext,
            config.prompt,
          );

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

    for (const result of sceneResults) {
      for (const match of result.alertMatches) {
        if (!match.matched) continue;
        matchedAlerts.push({
          kind: "scene-match",
          matched: true,
          pluginId: result.pluginId,
          pluginName: result.pluginName,
          category: result.category,
          description: match.description,
          severity: match.severity,
          confidence: match.confidence,
          evidence: match.evidence,
        });
      }
    }

    const evaluatedAt = new Date(payload.endedAt || payload.startedAt);
    const cooldownResult = applyAlertCooldown(
      matchedAlerts,
      cooldownByPlugin,
      previousSegmentData?.alertState ?? {},
      Number.isNaN(evaluatedAt.getTime()) ? new Date() : evaluatedAt,
    );
    const emittedAlerts = cooldownResult.alerts;

    // Persist results to video_segments.data
    await step.do("save-findings", STEP_RETRIES, async (context) => {
      await this.beginStep(payload.processId, context.step.name, context.attempt);
      const db = createDatabase(this.env.DATABASE);

      const data = {
        source: "facilix-processor",
        analysisVersion: 12,
        workflowExecutions: workflowGroups.map((group) => ({
          workflowId: group.workflow.workflowId,
          pluginIds: group.plugins.map((entry) => entry.plugin.id),
        })),
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
  config: DevicePluginConfig;
  detections: WorkflowDetection[];
  detectionCounts: Record<string, number>;
  maxCount: number;
  operationalState: string;
  storedDetectionOutputs: StoredDetectionRef[];
  matchedAlerts: MatchedAlert[];
}

function buildRoboflowVideoContext(
  result: PluginDetectionResult | undefined,
  video: DetectionVideoMeta | null,
): string {
  if (!result && !video) return "";

  const detections = result?.detections ?? [];
  const maxDetections = 200;
  const sampledDetections =
    detections.length <= maxDetections
      ? detections
      : Array.from({ length: maxDetections }, (_, index) => {
          const sourceIndex = Math.round((index * (detections.length - 1)) / (maxDetections - 1));
          return detections[sourceIndex];
        });
  const context = {
    workflowId: result?.workflowId,
    videoMetadata: video ?? undefined,
    detectionCounts: result?.detectionCounts ?? {},
    configuredCountValue: result?.maxCount,
    operationalState: result?.operationalState,
    totalDetections: detections.length,
    includedDetections: sampledDetections.length,
    omittedDetections: Math.max(0, detections.length - sampledDetections.length),
    detections: sampledDetections.map((detection) => ({
      label: detection.label,
      confidence: Number(detection.confidence.toFixed(4)),
      atSec: detection.atSec === undefined ? undefined : Number(detection.atSec.toFixed(3)),
      frameIndex: detection.frameIndex,
      trackId: detection.trackId,
      box: detection.box,
    })),
  };

  return `\n\nUse this Roboflow output as supplemental machine-generated context. Verify it against the video rather than treating it as ground truth. Detection totals can include repeated appearances across sampled frames:\n${JSON.stringify(context)}`;
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
          detectionResult.storedDetectionOutputs,
          detectionResult.detections,
          { kind: alert.kind, labels: alert.matchedLabels },
          config.maxAnnotatedFrames,
        )
      : [];
  const attachments: EventAttachmentInput[] = selectedFrames.map((frame, index) => {
    const detections = detectionResult?.detections.filter((item) => item.frameIndex === frame.frameIndex) ?? [];
    return {
      assetId: frame.assetId,
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
        detectionCount: detections.length || frame.detectionCount || 0,
        confidence:
          detections.length > 0 ? Math.max(...detections.map((item) => item.confidence)) : frame.maxConfidence,
        detections: detections.map((item) => ({
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

function sanitizeWorkflowKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

async function loadSegmentBytes(bucket: R2Bucket, assetId: string): Promise<Uint8Array> {
  const object = await bucket.get(assetId);
  if (!object) throw new Error(`segment not found in R2: ${assetId}`);
  return object.bytes();
}

async function persistDetectionOutputs({
  database,
  bucket,
  segmentId,
  facilityId,
  deviceId,
  workflow,
  plugins,
  frames,
}: {
  database: D1Database;
  bucket: R2Bucket;
  segmentId: string;
  facilityId: string;
  deviceId: string;
  workflow: import("#/lib/monitoring/plugins").PluginWorkflowConfig;
  plugins: Array<{ pluginId: string; config: DevicePluginConfig }>;
  frames: DetectionFrame[];
}): Promise<Record<string, StoredDetectionRef[]>> {
  const db = createDatabase(database);
  const outputName = "detections";
  const storedByPlugin: Record<string, StoredDetectionRef[]> = Object.fromEntries(
    plugins.map((plugin) => [plugin.pluginId, []]),
  );
  const workflowAssetKey = sanitizeWorkflowKey(workflowIdentity(workflow));

  for (const frame of frames) {
    const frameIndex = frame.frameIndex;
    const key = `video-frames/${segmentId}/${workflowAssetKey}/${frameIndex}.jpg`;
    const bytes = base64ToArrayBuffer(frame.beforeImage);
    await persistDetectionImage(db, bucket, key, bytes, `${segmentId}-${workflowAssetKey}-${frameIndex}.jpg`);

    for (const plugin of plugins) {
      const detections = filterDetectionsForPlugin(frame.detections, plugin.config);
      const serializedDetections = detections.map((d) => ({ ...d }));
      await db
        .insert(schema.videoFrame)
        .values({
          assetId: key,
          segmentId,
          facilityId,
          deviceId,
          pluginId: plugin.pluginId,
          workflowId: workflow.workflowId,
          outputName,
          frameIndex,
          atSec: frame.atSec,
          detections: serializedDetections,
          image: frame.image,
        })
        .onConflictDoUpdate({
          target: [
            schema.videoFrame.segmentId,
            schema.videoFrame.pluginId,
            schema.videoFrame.workflowId,
            schema.videoFrame.outputName,
            schema.videoFrame.frameIndex,
          ],
          set: {
            assetId: key,
            detections: serializedDetections,
            image: frame.image,
          },
        });
      storedByPlugin[plugin.pluginId].push({
        assetId: key,
        frameIndex,
        atSec: frame.atSec,
        detectionCount: detections.length,
        labels: [...new Set(detections.map((detection) => detection.label))],
        maxConfidence:
          detections.length > 0 ? Math.max(...detections.map((detection) => detection.confidence)) : undefined,
      });
    }
  }
  return storedByPlugin;
}

async function persistDetectionImage(
  db: ReturnType<typeof createDatabase>,
  bucket: R2Bucket,
  assetId: string,
  bytes: ArrayBuffer,
  name: string,
): Promise<void> {
  await bucket.put(assetId, bytes, {
    httpMetadata: { contentType: "image/jpeg" },
    customMetadata: { name },
  });
  await db
    .insert(schema.asset)
    .values({
      id: assetId,
      name,
      type: "image/jpeg",
      size: bytes.byteLength,
      hash: "",
    })
    .onConflictDoUpdate({
      target: schema.asset.id,
      set: { size: bytes.byteLength, updatedAt: new Date() },
    });
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
