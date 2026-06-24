/**
 * CCTV intelligence plugin catalog and per-device configuration.
 *
 * Two plugin kinds exist:
 *
 * - `segment-understanding` — OpenRouter multimodal analysis for scene summaries
 *   and natural-language scene alerts.
 * - `workflow-object-detection` — Roboflow Workflow for object detection with
 *   configurable alert rules per plugin (count thresholds, enter/leave).
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

// ─── Alert rule types ─────────────────────────────────────────────────────

/** Comparison operator for count-based rules. */
export type ComparisonOperator = "gt" | "gte" | "lt" | "lte" | "eq";

/** How to count detections for threshold evaluation. */
export type ThresholdMode = "max-per-frame" | "total-detections" | "unique-tracks";

/** Severity level for alert events. */
export type AlertSeverity = "info" | "warn" | "error";

/** Alert when detection count crosses a threshold. */
export interface CountThresholdAlertRule {
  kind: "count-threshold";
  enabled: boolean;
  /** Threshold value for alerting. */
  threshold: number;
  /** Comparison operator for threshold check. */
  operator: ComparisonOperator;
  /** How to count detections for threshold evaluation. */
  thresholdMode: ThresholdMode;
  /** Severity level for alert events. */
  severity: AlertSeverity;
}

/** Alert when objects appear (count goes from 0 to >0). */
export interface ObjectEntersAlertRule {
  kind: "object-enters";
  enabled: boolean;
  /** Optional label filter — only trigger for these classes. If empty, any class. */
  labels?: string[];
  severity: AlertSeverity;
}

/** Alert when objects disappear (count goes from >0 to 0). */
export interface ObjectLeavesAlertRule {
  kind: "object-leaves";
  enabled: boolean;
  /** Optional label filter — only trigger for these classes. If empty, any class. */
  labels?: string[];
  severity: AlertSeverity;
}

/** Alert when a scene matches a natural-language description. */
export interface SceneMatchAlertRule {
  kind: "scene-match";
  enabled: boolean;
  /** Natural-language description of what to detect. */
  description: string;
  severity: AlertSeverity;
}

/** Union of all detection alert rule types. */
export type DetectionAlertRule = CountThresholdAlertRule | ObjectEntersAlertRule | ObjectLeavesAlertRule;

/** Union of all scene alert rule types. */
export type SceneAlertRule = SceneMatchAlertRule;

/** All alert rule types. */
export type AlertRule = DetectionAlertRule | SceneAlertRule;

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
  /** Legacy prompt (used when no alerts are configured, or as the base prompt). */
  prompt: string;
  /** Legacy severity (used when no alerts are configured). */
  severity: AlertSeverity;
  /** Multiple scene alert rules. */
  alerts: SceneAlertRule[];
}

/** Config for `workflow-object-detection` plugins. */
export interface WorkflowObjectDetectionDeviceConfig extends DevicePluginConfigBase {
  /** Legacy single threshold (backward compat — normalized into alerts[0]). */
  threshold: number;
  /** Legacy single operator (backward compat). */
  operator: ComparisonOperator;
  /** Legacy threshold mode (backward compat). */
  thresholdMode: ThresholdMode;
  /** Minimum confidence for detections to be counted. */
  minConfidence: number;
  /** Legacy single alert severity (backward compat). */
  alertSeverity: AlertSeverity;
  /** Optional class filter — only detect these classes. If empty, detect all. */
  classes?: string[];
  /** Multiple detection alert rules. */
  alerts: DetectionAlertRule[];
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
    description:
      "Uses AI vision to watch for scenes you describe in natural language. Add multiple alerts to monitor different scenarios.",
    kind: "segment-understanding",
    provider: "openrouter",
    defaultPrompt: DEFAULT_SEGMENT_PROMPT,
  },
  {
    id: "people-detection",
    name: "People Detection",
    description: "Detects people and alerts when counts cross thresholds or people enter/leave the scene.",
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
    description: "Detects vehicles and alerts when counts cross thresholds or vehicles enter/leave the scene.",
    kind: "workflow-object-detection",
    provider: "roboflow",
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "vehicle-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
  },
  {
    id: "object-detection",
    name: "Object Detection",
    description: "Detects any object class (car, truck, person, dining table, etc.) with configurable class filters.",
    kind: "workflow-object-detection",
    provider: "roboflow",
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "object-detection",
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

// ─── Alert rule helpers ───────────────────────────────────────────────────

function createDefaultSceneAlert(description: string): SceneMatchAlertRule {
  return {
    kind: "scene-match",
    enabled: true,
    description,
    severity: "warn",
  };
}

function normalizeAlertRule(raw: unknown): DetectionAlertRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const kind = typeof r.kind === "string" ? r.kind : "count-threshold";
  const enabled = r.enabled !== false;

  if (kind === "object-enters") {
    return {
      kind: "object-enters",
      enabled,
      labels: Array.isArray(r.labels) ? r.labels.filter((l): l is string => typeof l === "string") : undefined,
      severity: normalizeSeverity(r.severity),
    };
  }

  if (kind === "object-leaves") {
    return {
      kind: "object-leaves",
      enabled,
      labels: Array.isArray(r.labels) ? r.labels.filter((l): l is string => typeof l === "string") : undefined,
      severity: normalizeSeverity(r.severity),
    };
  }

  // Default: count-threshold
  return {
    kind: "count-threshold",
    enabled,
    threshold: normalizeNumber(r.threshold, DEFAULT_COUNTING_THRESHOLD),
    operator: normalizeOperator(r.operator),
    thresholdMode: normalizeThresholdMode(r.thresholdMode),
    severity: normalizeSeverity(r.severity),
  };
}

function normalizeSceneAlertRule(raw: unknown): SceneMatchAlertRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const description = typeof r.description === "string" && r.description.length > 0 ? r.description : "";
  if (!description) return null;
  return {
    kind: "scene-match",
    enabled: r.enabled !== false,
    description,
    severity: normalizeSeverity(r.severity),
  };
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
    const severity = normalizeSeverity(r.severity);

    // Normalize alerts — migrate legacy single prompt into scene alerts
    let alerts: SceneAlertRule[];
    if (Array.isArray(r.alerts) && r.alerts.length > 0) {
      alerts = r.alerts.map(normalizeSceneAlertRule).filter((a): a is SceneMatchAlertRule => a !== null);
    }
    // If no alerts but there's a non-default prompt, create one alert from it
    if (!alerts || alerts.length === 0) {
      alerts = [createDefaultSceneAlert(prompt)];
    }

    return { pluginId, enabled, prompt, severity, alerts, trigger, cooldownSec };
  }

  if (plugin.kind === "workflow-object-detection") {
    const threshold = normalizeNumber(r.threshold, DEFAULT_COUNTING_THRESHOLD);
    const operator = normalizeOperator(r.operator);
    const thresholdMode = normalizeThresholdMode(r.thresholdMode);
    const minConfidence = normalizeConfidence(r.minConfidence);
    const alertSeverity = normalizeSeverity(r.alertSeverity);
    const classes = Array.isArray(r.classes)
      ? r.classes.filter((c): c is string => typeof c === "string" && c.length > 0)
      : undefined;

    // Normalize alerts — migrate legacy single threshold into alert rules
    let alerts: DetectionAlertRule[];
    if (Array.isArray(r.alerts) && r.alerts.length > 0) {
      alerts = r.alerts.map(normalizeAlertRule).filter((a): a is DetectionAlertRule => a !== null);
    }
    // If no alerts, create a default count-threshold alert from legacy fields
    if (!alerts || alerts.length === 0) {
      alerts = [
        {
          kind: "count-threshold",
          enabled: true,
          threshold,
          operator,
          thresholdMode,
          severity: alertSeverity,
        },
      ];
    }

    return {
      pluginId,
      enabled,
      threshold,
      operator,
      thresholdMode,
      minConfidence,
      alertSeverity,
      classes,
      alerts,
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

function normalizeSeverity(value: unknown): AlertSeverity {
  return (["info", "warn", "error"] as const).includes(value as never) ? (value as AlertSeverity) : "warn";
}

function normalizeOperator(value: unknown): ComparisonOperator {
  const valid = ["gt", "gte", "lt", "lte", "eq"] as const;
  return valid.includes(value as never) ? (value as ComparisonOperator) : DEFAULT_COUNTING_OPERATOR;
}

function normalizeThresholdMode(value: unknown): ThresholdMode {
  const valid = ["max-per-frame", "total-detections", "unique-tracks"] as const;
  return valid.includes(value as never) ? (value as ThresholdMode) : "max-per-frame";
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
 * Evaluate a count-threshold alert rule against detections from a single workflow.
 * `countValue` is the pre-computed count from the processor.
 */
export function evaluateCountThreshold(countValue: number, rule: CountThresholdAlertRule): ThresholdResult {
  const { threshold, operator, thresholdMode } = rule;
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
  return { exceeded, count: countValue, threshold, operator, thresholdMode };
}

/**
 * Evaluate whether an enter/leave transition occurred.
 * @param currentCount - Count of matching objects in the current segment.
 * @param previousCount - Count of matching objects in the previous segment (null if unknown).
 * @returns true if the transition condition is met.
 */
export function evaluateTransition(
  currentCount: number,
  previousCount: number | null,
  kind: "object-enters" | "object-leaves",
): boolean {
  if (previousCount === null) return false;
  if (kind === "object-enters") return previousCount === 0 && currentCount > 0;
  if (kind === "object-leaves") return previousCount > 0 && currentCount === 0;
  return false;
}

/**
 * Count detections matching optional label filter.
 */
export function countByLabelFilter(detections: Array<{ label: string }>, labels?: string[]): number {
  if (!labels || labels.length === 0) return detections.length;
  const labelSet = new Set(labels.map((l) => l.toLowerCase()));
  return detections.filter((d) => labelSet.has(d.label.toLowerCase())).length;
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
