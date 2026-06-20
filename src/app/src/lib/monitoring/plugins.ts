/**
 * CCTV intelligence plugin catalog and per-device configuration.
 *
 * Two plugin kinds exist:
 *
 * - `segment-understanding` — OpenRouter multimodal analysis for scene summaries.
 * - `workflow-object-detection` — Roboflow Workflow for object detection with
 *   configurable alert thresholds per plugin.
 *
 * Object detection only runs for plugins that are explicitly enabled on each
 * CCTV device. If no detection plugins are enabled, no Roboflow calls are made.
 *
 * Per-CCTV plugin configuration is stored on the device row's JSON
 * `data.plugins` field.
 */

// ─── Basic types ──────────────────────────────────────────────────────────

/** Source that powers the plugin's inference. */
export type PluginProvider = "openrouter" | "roboflow";

/** How a plugin analyses media. */
export type PluginKind = "segment-understanding" | "workflow-object-detection";

/** Per-plugin trigger policy. */
export type PluginTrigger = { mode: "segment"; intervalSec?: number };

/** Workflow identity for Roboflow plugins. */
export interface PluginWorkflowConfig {
  workspaceName: string;
  workflowId: string;
  inputName: string;
  dataOutputNames?: string[];
}

/** A curated plugin available in the catalog. */
export interface Plugin {
  id: string;
  name: string;
  description: string;
  kind: PluginKind;
  provider: PluginProvider;
  /** Roboflow workflow config (only for workflow-object-detection plugins). */
  workflow?: PluginWorkflowConfig;
  /** Default prompt (segment-understanding only). */
  defaultPrompt?: string;
}

// ─── Per-device config interfaces ──────────────────────────────────────────

/** Shared fields for every plugin config. */
interface DevicePluginConfigBase {
  pluginId: string;
  enabled: boolean;
  trigger?: PluginTrigger;
  cooldownSec?: number;
}

/** Config for `segment-understanding` plugins. */
export interface SegmentAnalysisDeviceConfig extends DevicePluginConfigBase {
  prompt: string;
  severity: "info" | "warn" | "error";
}

/** Config for `workflow-object-detection` plugins. */
export interface WorkflowObjectDetectionDeviceConfig extends DevicePluginConfigBase {
  /** Threshold value for alerting. */
  threshold: number;
  /** Comparison operator for threshold check. */
  operator: "gt" | "gte" | "lt" | "lte" | "eq";
  /** How to count detections for threshold evaluation. */
  thresholdMode: "max-per-frame" | "total-detections" | "unique-tracks";
  /** Minimum confidence for detections to be counted. */
  minConfidence: number;
  /** Severity level for threshold alert events. */
  alertSeverity: "info" | "warn" | "error";
}

/** Union of all per-device configs. */
export type DevicePluginConfig = SegmentAnalysisDeviceConfig | WorkflowObjectDetectionDeviceConfig;

/** Plugin + per-device config resolved for inference. */
export interface ResolvedPlugin<T extends DevicePluginConfig = DevicePluginConfig> {
  plugin: Plugin;
  config: T;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_PLUGIN_CONFIDENCE = 0.4;
export const DEFAULT_COUNTING_OPERATOR = "gte" as const;
export const DEFAULT_COUNTING_THRESHOLD = 1;
export const DEFAULT_SEGMENT_PROMPT =
  "Analyze this CCTV clip for anomalies, safety violations, or unusual activity. " +
  'Respond in JSON format: { "alert": boolean, "severity": "info"|"warn"|"error", ' +
  '"message": string, "summary": string }.';

// ─── Curated catalog ──────────────────────────────────────────────────────

export const PLUGINS: Plugin[] = [
  {
    id: "natural-language",
    name: "Natural Language",
    description: "Uses AI video understanding to watch for anomalies described in natural language.",
    kind: "segment-understanding",
    provider: "openrouter",
    defaultPrompt: DEFAULT_SEGMENT_PROMPT,
  },
  {
    id: "people-detection",
    name: "People Detection",
    description: "Detects people in the video segment and alerts when the count crosses a configured threshold.",
    kind: "workflow-object-detection",
    provider: "roboflow",
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "people-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
  },
  {
    id: "vehicle-detection",
    name: "Vehicle Detection",
    description: "Detects vehicles in the video segment and alerts when the count crosses a configured threshold.",
    kind: "workflow-object-detection",
    provider: "roboflow",
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "vehicle-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
  },
];

const PLUGIN_BY_ID: Map<string, Plugin> = new Map(PLUGINS.map((p) => [p.id, p]));

/** Lookup a curated plugin by id. */
export function getPlugin(id: string): Plugin | undefined {
  return PLUGIN_BY_ID.get(id);
}

// ─── Normalisation ────────────────────────────────────────────────────────

function normalizeOne(raw: unknown): DevicePluginConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pluginId = typeof r.pluginId === "string" ? r.pluginId : "";
  const plugin = getPlugin(pluginId);
  if (!plugin) return null;

  const enabled = r.enabled === true;
  const trigger = normalizeTrigger(r);
  const cooldownSec = normalizeCooldown(r);

  if (plugin.kind === "segment-understanding") {
    const prompt =
      typeof r.prompt === "string" && r.prompt.length > 0 ? r.prompt : (plugin.defaultPrompt ?? DEFAULT_SEGMENT_PROMPT);
    const severity = (["info", "warn", "error"] as const).includes(r.severity as never)
      ? (r.severity as SegmentAnalysisDeviceConfig["severity"])
      : "warn";
    return { pluginId, enabled, prompt, severity, trigger, cooldownSec };
  }

  if (plugin.kind === "workflow-object-detection") {
    const threshold = normalizeNumber(r.threshold, DEFAULT_COUNTING_THRESHOLD);
    const operator = normalizeOperator(r.operator);
    const thresholdMode = normalizeThresholdMode(r.thresholdMode);
    const minConfidence = normalizeConfidence(r.minConfidence);
    const alertSeverity = (["info", "warn", "error"] as const).includes(r.alertSeverity as never)
      ? (r.alertSeverity as WorkflowObjectDetectionDeviceConfig["alertSeverity"])
      : "warn";
    return {
      pluginId,
      enabled,
      threshold,
      operator,
      thresholdMode,
      minConfidence,
      alertSeverity,
      trigger,
      cooldownSec,
    };
  }

  return null;
}

function normalizeConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_PLUGIN_CONFIDENCE;
}

function normalizeCooldown(r: Record<string, unknown>): number | undefined {
  const cd = typeof r.cooldownSec === "number" ? r.cooldownSec : Number(r.cooldownSec);
  return Number.isFinite(cd) && cd >= 0 ? cd : undefined;
}

function normalizeTrigger(r: Record<string, unknown>): PluginTrigger | undefined {
  const t = r.trigger as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return undefined;
  if (t.mode === "segment") {
    return { mode: "segment", intervalSec: typeof t.intervalSec === "number" ? t.intervalSec : undefined };
  }
  return undefined;
}

function normalizeOperator(value: unknown): WorkflowObjectDetectionDeviceConfig["operator"] {
  const valid = ["gt", "gte", "lt", "lte", "eq"] as const;
  return valid.includes(value as never)
    ? (value as WorkflowObjectDetectionDeviceConfig["operator"])
    : DEFAULT_COUNTING_OPERATOR;
}

function normalizeThresholdMode(value: unknown): WorkflowObjectDetectionDeviceConfig["thresholdMode"] {
  const valid = ["max-per-frame", "total-detections", "unique-tracks"] as const;
  return valid.includes(value as never)
    ? (value as WorkflowObjectDetectionDeviceConfig["thresholdMode"])
    : "max-per-frame";
}

function normalizeNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Normalize the plugin list stored in a CCTV device's `data.plugins` field. */
export function normalizePlugins(value: unknown): DevicePluginConfig[] {
  if (!value || !Array.isArray(value)) return [];
  const out: DevicePluginConfig[] = [];
  for (const entry of value) {
    const n = normalizeOne(entry);
    if (n) out.push(n);
  }
  return out;
}

// ─── Resolution ────────────────────────────────────────────────────────────

/** Build the list of resolved plugins that should execute. */
export function resolveEnabledPlugins(configs: DevicePluginConfig[]): ResolvedPlugin[] {
  const out: ResolvedPlugin[] = [];
  for (const config of configs) {
    if (!config.enabled) continue;
    const plugin = getPlugin(config.pluginId);
    if (!plugin) continue;
    out.push({ plugin, config: config as never });
  }
  return out;
}

// ─── Threshold evaluation ──────────────────────────────────────────────────

export type ThresholdResult = {
  exceeded: boolean;
  count: number;
  threshold: number;
  operator: string;
  thresholdMode: string;
};

/**
 * Evaluate a threshold against detections from a single workflow.
 * `countValue` is the pre-computed count from the processor.
 */
export function evaluateThreshold(countValue: number, config: WorkflowObjectDetectionDeviceConfig): ThresholdResult {
  const { threshold, operator } = config;
  let exceeded = false;
  switch (operator) {
    case "gt":
      exceeded = countValue > threshold;
      break;
    case "gte":
      exceeded = countValue >= threshold;
      break;
    case "lt":
      exceeded = countValue < threshold;
      break;
    case "lte":
      exceeded = countValue <= threshold;
      break;
    case "eq":
      exceeded = countValue === threshold;
      break;
  }
  return {
    exceeded,
    count: countValue,
    threshold,
    operator,
    thresholdMode: config.thresholdMode,
  };
}

// ─── Trigger helpers ──────────────────────────────────────────────────────

/** Determine if a plugin should run based on its trigger and last run time. */
export function shouldRun(config: DevicePluginConfig, lastRunAt: Date | null, now: Date): boolean {
  if (!config.enabled) return false;
  const trigger = config.trigger;
  if (!trigger) return true;
  if (trigger.mode === "segment") {
    if (!lastRunAt) return true;
    const interval = (trigger.intervalSec ?? 600) * 1000;
    return now.getTime() - lastRunAt.getTime() >= interval;
  }
  return true;
}
