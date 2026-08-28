/**
 * Outcome-oriented CCTV intelligence plugins.
 *
 * Every plugin is backed by a vision model. Plugins that need richer
 * reasoning additionally run a vision-language review using representative
 * original and annotated frames produced by that workflow.
 */

// ─── Catalog types ────────────────────────────────────────────────────────

export type PluginProvider = "vision";
export type PluginKind = "segment-understanding" | "workflow-object-detection";
export type PluginCategory = "security" | "compliance" | "operations" | "hygiene" | "safety";
export type PluginTrigger = { mode: "segment"; intervalSec?: number };

export interface PluginWorkflowConfig {
  workspaceName: string;
  workflowId: string;
  inputName: string;
  dataOutputNames?: string[];
}

export interface PluginEvidenceConfig {
  attachVideo: boolean;
  attachAnnotatedFrames: boolean;
  maxAnnotatedFrames: number;
}

interface PluginBase {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  provider: PluginProvider;
  workflow: PluginWorkflowConfig;
  watchFor: string[];
  alertsWhen: string[];
  recommendedFor: string[];
  recommendedAction: string;
  defaultEvidence: PluginEvidenceConfig;
  defaultClasses?: string[];
  defaultConfidence: number;
  defaultCooldownSec: number;
}

export interface SegmentUnderstandingPlugin extends PluginBase {
  kind: "segment-understanding";
  usesVisionLanguage: true;
  defaultPrompt: string;
  defaultAlerts: SceneAlertRule[];
}

export interface WorkflowObjectDetectionPlugin extends PluginBase {
  kind: "workflow-object-detection";
  defaultAlerts: DetectionAlertRule[];
}

export type Plugin = SegmentUnderstandingPlugin | WorkflowObjectDetectionPlugin;

// ─── Alert rules ──────────────────────────────────────────────────────────

export type ComparisonOperator = "gt" | "gte" | "lt" | "lte" | "eq";
export type ThresholdMode = "max-per-frame" | "total-detections" | "unique-tracks";
export type AlertSeverity = "info" | "warn" | "error";

export interface CountThresholdAlertRule {
  kind: "count-threshold";
  enabled: boolean;
  threshold: number;
  operator: ComparisonOperator;
  thresholdMode: ThresholdMode;
  severity: AlertSeverity;
}

export interface ObjectEntersAlertRule {
  kind: "object-enters";
  enabled: boolean;
  labels?: string[];
  severity: AlertSeverity;
}

export interface ObjectLeavesAlertRule {
  kind: "object-leaves";
  enabled: boolean;
  labels?: string[];
  severity: AlertSeverity;
}

export interface SceneMatchAlertRule {
  kind: "scene-match";
  enabled: boolean;
  description: string;
  severity: AlertSeverity;
}

export type DetectionAlertRule = CountThresholdAlertRule | ObjectEntersAlertRule | ObjectLeavesAlertRule;
export type SceneAlertRule = SceneMatchAlertRule;
export type AlertRule = DetectionAlertRule | SceneAlertRule;

// ─── Per-camera configuration ─────────────────────────────────────────────

interface DevicePluginConfigBase<K extends PluginKind> {
  schemaVersion: 3;
  kind: K;
  pluginId: string;
  enabled: boolean;
  minConfidence: number;
  classes?: string[];
  trigger?: PluginTrigger;
  cooldownSec?: number;
  evidence: PluginEvidenceConfig;
}

export interface SegmentAnalysisDeviceConfig extends DevicePluginConfigBase<"segment-understanding"> {
  prompt: string;
  severity: AlertSeverity;
  alerts: SceneAlertRule[];
}

export interface WorkflowObjectDetectionDeviceConfig extends DevicePluginConfigBase<"workflow-object-detection"> {
  threshold: number;
  operator: ComparisonOperator;
  thresholdMode: ThresholdMode;
  alertSeverity: AlertSeverity;
  alerts: DetectionAlertRule[];
}

export type DevicePluginConfig = SegmentAnalysisDeviceConfig | WorkflowObjectDetectionDeviceConfig;

export type ResolvedPlugin =
  | { kind: "segment-understanding"; plugin: SegmentUnderstandingPlugin; config: SegmentAnalysisDeviceConfig }
  | {
      kind: "workflow-object-detection";
      plugin: WorkflowObjectDetectionPlugin;
      config: WorkflowObjectDetectionDeviceConfig;
    };

export interface WorkflowExecutionGroup {
  key: string;
  workflow: PluginWorkflowConfig;
  plugins: ResolvedPlugin[];
  minConfidence: number;
  classFilter?: string[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────

export const PLUGIN_SCHEMA_VERSION = 3 as const;
export const DEFAULT_PLUGIN_CONFIDENCE = 0.4;
export const DEFAULT_COUNTING_OPERATOR = "gte" as const;
export const DEFAULT_COUNTING_THRESHOLD = 1;
export const DEFAULT_SEGMENT_PROMPT =
  "Review the complete CCTV video segment for the configured operational risks. Describe only visible evidence.";

const VISION_OBJECT_MODEL = requiredVisionModel(import.meta.env.VISION_OBJECT_MODEL, "VISION_OBJECT_MODEL");
const VISION_VEHICLE_MODEL = requiredVisionModel(import.meta.env.VISION_VEHICLE_MODEL, "VISION_VEHICLE_MODEL");

export const DEFAULT_OBJECT_DETECTION_WORKFLOW: PluginWorkflowConfig = {
  workspaceName: "dentolos19",
  workflowId: VISION_OBJECT_MODEL,
  inputName: "image",
  dataOutputNames: ["image", "detections", "count"],
};

const VEHICLE_DETECTION_WORKFLOW: PluginWorkflowConfig = {
  ...DEFAULT_OBJECT_DETECTION_WORKFLOW,
  workflowId: VISION_VEHICLE_MODEL,
};

function requiredVisionModel(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} must be configured`);
  return normalized;
}

const PERSON_LABELS = ["person"];
const VEHICLE_LABELS = ["vehicle", "car", "truck", "bus", "van"];
const DETECTION_EVIDENCE: PluginEvidenceConfig = {
  attachVideo: true,
  attachAnnotatedFrames: true,
  maxAnnotatedFrames: 3,
};
const VISION_LANGUAGE_EVIDENCE: PluginEvidenceConfig = {
  attachVideo: true,
  attachAnnotatedFrames: true,
  maxAnnotatedFrames: 2,
};

// ─── Outcome catalog ──────────────────────────────────────────────────────

export const PLUGINS: Plugin[] = [
  {
    id: "restricted-area-protection",
    name: "Restricted Area Protection",
    description: "Protect sensitive areas by alerting when a person enters or remains visible in the camera view.",
    category: "security",
    kind: "workflow-object-detection",
    provider: "vision",
    workflow: DEFAULT_OBJECT_DETECTION_WORKFLOW,
    watchFor: ["People entering the monitored area", "Unexpected occupancy"],
    alertsWhen: ["A person appears", "The configured occupancy limit is reached"],
    recommendedFor: ["Restricted areas", "Entry points", "Cold storage"],
    recommendedAction: "Verify authorization, contact security, and secure the affected area.",
    defaultEvidence: DETECTION_EVIDENCE,
    defaultClasses: PERSON_LABELS,
    defaultConfidence: 0.5,
    defaultCooldownSec: 300,
    defaultAlerts: [
      { kind: "object-enters", enabled: true, labels: PERSON_LABELS, severity: "error" },
      {
        kind: "count-threshold",
        enabled: true,
        threshold: 1,
        operator: "gte",
        thresholdMode: "max-per-frame",
        severity: "error",
      },
    ],
  },
  {
    id: "ppe-compliance",
    name: "PPE Compliance",
    description: "Review food-operation footage for visible missing or incorrectly worn protective equipment.",
    category: "compliance",
    kind: "segment-understanding",
    provider: "vision",
    workflow: DEFAULT_OBJECT_DETECTION_WORKFLOW,
    usesVisionLanguage: true,
    watchFor: ["Hairnets and hair covering", "Face masks", "Required protective clothing"],
    alertsWhen: ["Required PPE is visibly missing or worn incorrectly"],
    recommendedFor: ["PPE checkpoints", "Food operations", "Tenant production areas"],
    recommendedAction: "Stop entry to the controlled area and correct the PPE violation.",
    defaultEvidence: VISION_LANGUAGE_EVIDENCE,
    defaultConfidence: DEFAULT_PLUGIN_CONFIDENCE,
    defaultCooldownSec: 300,
    defaultPrompt:
      "Review the original and annotated frames as a food-factory PPE compliance check. Treat vision annotations as location hints, and report only clearly visible violations.",
    defaultAlerts: [
      {
        kind: "scene-match",
        enabled: true,
        description: "A person is in the monitored area without a hairnet, or their hair is visibly uncovered.",
        severity: "error",
      },
      {
        kind: "scene-match",
        enabled: true,
        description: "A person is in the monitored area without the required face mask or protective clothing.",
        severity: "warn",
      },
    ],
  },
  {
    id: "loading-bay-operations",
    name: "Loading Bay Operations",
    description: "Track vehicle arrivals, departures, occupancy, and congestion at a loading bay.",
    category: "operations",
    kind: "workflow-object-detection",
    provider: "vision",
    workflow: VEHICLE_DETECTION_WORKFLOW,
    watchFor: ["Vehicle arrivals and departures", "Bay occupancy", "Multiple waiting vehicles"],
    alertsWhen: ["A vehicle arrives or leaves", "More than one vehicle is present"],
    recommendedFor: ["Loading Bay 1", "Loading Bay 2", "Delivery approaches"],
    recommendedAction: "Confirm the bay assignment and coordinate waiting drivers if congestion is forming.",
    defaultEvidence: DETECTION_EVIDENCE,
    defaultClasses: VEHICLE_LABELS,
    defaultConfidence: 0.45,
    defaultCooldownSec: 120,
    defaultAlerts: [
      { kind: "object-enters", enabled: true, labels: VEHICLE_LABELS, severity: "info" },
      { kind: "object-leaves", enabled: true, labels: VEHICLE_LABELS, severity: "info" },
      {
        kind: "count-threshold",
        enabled: true,
        threshold: 2,
        operator: "gte",
        thresholdMode: "max-per-frame",
        severity: "warn",
      },
    ],
  },
  {
    id: "hygiene-pest-watch",
    name: "Hygiene & Pest Watch",
    description: "Review food-sensitive areas for visible pests, spills, standing water, and waste risks.",
    category: "hygiene",
    kind: "segment-understanding",
    provider: "vision",
    workflow: DEFAULT_OBJECT_DETECTION_WORKFLOW,
    usesVisionLanguage: true,
    watchFor: ["Rodents and visible pests", "Spills or standing water", "Exposed or accumulated waste"],
    alertsWhen: ["A visible hygiene risk is present"],
    recommendedFor: ["Food operations", "Waste holding areas", "Loading bays"],
    recommendedAction: "Isolate the affected area and start the hygiene or pest-control response.",
    defaultEvidence: VISION_LANGUAGE_EVIDENCE,
    defaultConfidence: DEFAULT_PLUGIN_CONFIDENCE,
    defaultCooldownSec: 600,
    defaultPrompt:
      "Review the original and annotated frames for visible food-factory hygiene and pest risks. Treat vision annotations as hints, not ground truth.",
    defaultAlerts: [
      {
        kind: "scene-match",
        enabled: true,
        description: "A rodent, insect infestation, or other visible pest is present in the monitored area.",
        severity: "error",
      },
      {
        kind: "scene-match",
        enabled: true,
        description: "A spill, standing water, exposed waste, or significant waste accumulation is visible.",
        severity: "warn",
      },
    ],
  },
  {
    id: "workplace-safety",
    name: "Workplace Safety",
    description: "Review operational areas for falls, blocked exits, unsafe crowding, and vehicle proximity.",
    category: "safety",
    kind: "segment-understanding",
    provider: "vision",
    workflow: DEFAULT_OBJECT_DETECTION_WORKFLOW,
    usesVisionLanguage: true,
    watchFor: ["A fallen person", "Blocked emergency access", "Unsafe person and vehicle proximity"],
    alertsWhen: ["An immediate, visible safety hazard is present"],
    recommendedFor: ["Loading bays", "Parking", "Production corridors"],
    recommendedAction: "Pause nearby activity and dispatch the appropriate safety response.",
    defaultEvidence: VISION_LANGUAGE_EVIDENCE,
    defaultConfidence: DEFAULT_PLUGIN_CONFIDENCE,
    defaultCooldownSec: 180,
    defaultPrompt:
      "Review the original and annotated frames for immediate workplace safety hazards. Treat vision annotations as hints and report only visible evidence.",
    defaultAlerts: [
      {
        kind: "scene-match",
        enabled: true,
        description: "A person has fallen or appears unable to stand without assistance.",
        severity: "error",
      },
      {
        kind: "scene-match",
        enabled: true,
        description: "An emergency exit, walkway, or access route is visibly blocked.",
        severity: "error",
      },
      {
        kind: "scene-match",
        enabled: true,
        description: "A person is dangerously close to a moving forklift, truck, or other vehicle.",
        severity: "error",
      },
    ],
  },
];

const PLUGIN_BY_ID = new Map(PLUGINS.map((plugin) => [plugin.id, plugin]));

export function getPlugin(id: string): Plugin | undefined {
  return PLUGIN_BY_ID.get(id);
}

export function createPluginConfig(plugin: Plugin): DevicePluginConfig {
  const base = {
    schemaVersion: PLUGIN_SCHEMA_VERSION,
    kind: plugin.kind,
    pluginId: plugin.id,
    enabled: true,
    minConfidence: plugin.defaultConfidence,
    classes: plugin.defaultClasses ? [...plugin.defaultClasses] : undefined,
    cooldownSec: plugin.defaultCooldownSec,
    evidence: { ...plugin.defaultEvidence },
  };

  if (plugin.kind === "segment-understanding") {
    return {
      ...base,
      kind: plugin.kind,
      prompt: plugin.defaultPrompt,
      severity: plugin.defaultAlerts[0]?.severity ?? "warn",
      alerts: structuredClone(plugin.defaultAlerts),
    };
  }

  const alerts = structuredClone(plugin.defaultAlerts);
  const thresholdRule = alerts.find((alert): alert is CountThresholdAlertRule => alert.kind === "count-threshold");
  return {
    ...base,
    kind: plugin.kind,
    threshold: thresholdRule?.threshold ?? DEFAULT_COUNTING_THRESHOLD,
    operator: thresholdRule?.operator ?? DEFAULT_COUNTING_OPERATOR,
    thresholdMode: thresholdRule?.thresholdMode ?? "max-per-frame",
    alertSeverity: thresholdRule?.severity ?? alerts[0]?.severity ?? "warn",
    alerts,
  };
}

// ─── Normalization ────────────────────────────────────────────────────────

function normalizeDetectionAlertRule(raw: unknown): DetectionAlertRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rule = raw as Record<string, unknown>;
  const enabled = rule.enabled !== false;

  if (rule.kind === "object-enters" || rule.kind === "object-leaves") {
    return {
      kind: rule.kind,
      enabled,
      labels: normalizeStringArray(rule.labels),
      severity: normalizeSeverity(rule.severity),
    };
  }

  return {
    kind: "count-threshold",
    enabled,
    threshold: normalizeNumber(rule.threshold, DEFAULT_COUNTING_THRESHOLD),
    operator: normalizeOperator(rule.operator),
    thresholdMode: normalizeThresholdMode(rule.thresholdMode),
    severity: normalizeSeverity(rule.severity),
  };
}

function normalizeSceneAlertRule(raw: unknown): SceneMatchAlertRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rule = raw as Record<string, unknown>;
  const description = typeof rule.description === "string" ? rule.description.trim() : "";
  if (!description) return null;
  return {
    kind: "scene-match",
    enabled: rule.enabled !== false,
    description,
    severity: normalizeSeverity(rule.severity),
  };
}

function normalizeOne(raw: unknown): DevicePluginConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const pluginId = typeof value.pluginId === "string" ? value.pluginId : "";
  const plugin = getPlugin(pluginId);
  if (!plugin) return null;

  const defaults = createPluginConfig(plugin);
  const shared = {
    ...defaults,
    enabled: value.enabled === true,
    minConfidence: normalizeConfidence(value.minConfidence, defaults.minConfidence),
    classes: normalizeStringArray(value.classes) ?? defaults.classes,
    trigger: normalizeTrigger(value.trigger),
    cooldownSec: normalizeCooldown(value.cooldownSec) ?? defaults.cooldownSec,
    evidence: normalizeEvidence(value.evidence, plugin.defaultEvidence),
  };

  if (plugin.kind === "segment-understanding" && defaults.kind === "segment-understanding") {
    const alerts = Array.isArray(value.alerts)
      ? value.alerts.map(normalizeSceneAlertRule).filter((alert): alert is SceneMatchAlertRule => alert !== null)
      : [];
    return {
      ...shared,
      kind: plugin.kind,
      prompt: typeof value.prompt === "string" && value.prompt.trim() ? value.prompt : defaults.prompt,
      severity: normalizeSeverity(value.severity),
      alerts: alerts.length > 0 ? alerts : defaults.alerts,
    };
  }

  if (plugin.kind === "workflow-object-detection" && defaults.kind === "workflow-object-detection") {
    const threshold = normalizeNumber(value.threshold, defaults.threshold);
    const operator = normalizeOperator(value.operator);
    const thresholdMode = normalizeThresholdMode(value.thresholdMode);
    const alertSeverity = normalizeSeverity(value.alertSeverity);
    const alerts = Array.isArray(value.alerts)
      ? value.alerts.map(normalizeDetectionAlertRule).filter((alert): alert is DetectionAlertRule => alert !== null)
      : [];
    return {
      ...shared,
      kind: plugin.kind,
      threshold,
      operator,
      thresholdMode,
      alertSeverity,
      alerts:
        alerts.length > 0
          ? alerts
          : [{ kind: "count-threshold", enabled: true, threshold, operator, thresholdMode, severity: alertSeverity }],
    };
  }

  return null;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return strings.length > 0 ? strings : undefined;
}

function normalizeEvidence(value: unknown, fallback: PluginEvidenceConfig): PluginEvidenceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...fallback };
  const evidence = value as Record<string, unknown>;
  const maxFrames = Number(evidence.maxAnnotatedFrames);
  return {
    attachVideo: typeof evidence.attachVideo === "boolean" ? evidence.attachVideo : fallback.attachVideo,
    attachAnnotatedFrames:
      typeof evidence.attachAnnotatedFrames === "boolean"
        ? evidence.attachAnnotatedFrames
        : fallback.attachAnnotatedFrames,
    maxAnnotatedFrames:
      Number.isFinite(maxFrames) && maxFrames >= 0 ? Math.min(Math.floor(maxFrames), 3) : fallback.maxAnnotatedFrames,
  };
}

function normalizeConfidence(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

function normalizeCooldown(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function normalizeTrigger(value: unknown): PluginTrigger | undefined {
  if (!value || typeof value !== "object") return undefined;
  const trigger = value as Record<string, unknown>;
  if (trigger.mode !== "segment") return undefined;
  return {
    mode: "segment",
    intervalSec: typeof trigger.intervalSec === "number" ? trigger.intervalSec : undefined,
  };
}

function normalizeSeverity(value: unknown): AlertSeverity {
  return value === "info" || value === "warn" || value === "error" ? value : "warn";
}

function normalizeOperator(value: unknown): ComparisonOperator {
  return value === "gt" || value === "gte" || value === "lt" || value === "lte" || value === "eq"
    ? value
    : DEFAULT_COUNTING_OPERATOR;
}

function normalizeThresholdMode(value: unknown): ThresholdMode {
  return value === "max-per-frame" || value === "total-detections" || value === "unique-tracks"
    ? value
    : "max-per-frame";
}

function normalizeNumber(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizePlugins(value: unknown): DevicePluginConfig[] {
  if (!Array.isArray(value)) return [];
  const plugins: DevicePluginConfig[] = [];
  for (const entry of value) {
    const plugin = normalizeOne(entry);
    if (plugin) plugins.push(plugin);
  }
  return plugins;
}

export function resolveEnabledPlugins(configs: DevicePluginConfig[]): ResolvedPlugin[] {
  const resolved: ResolvedPlugin[] = [];
  for (const config of configs) {
    if (!config.enabled) continue;
    const plugin = getPlugin(config.pluginId);
    if (!plugin || plugin.kind !== config.kind) continue;
    if (plugin.kind === "segment-understanding" && config.kind === "segment-understanding") {
      resolved.push({ kind: plugin.kind, plugin, config });
    } else if (plugin.kind === "workflow-object-detection" && config.kind === "workflow-object-detection") {
      resolved.push({ kind: plugin.kind, plugin, config });
    }
  }
  return resolved;
}

export function workflowIdentity(workflow: PluginWorkflowConfig): string {
  return [
    workflow.workspaceName,
    workflow.workflowId,
    workflow.inputName,
    ...[...(workflow.dataOutputNames ?? [])].sort(),
  ].join(":");
}

export function groupPluginsByWorkflow(plugins: ResolvedPlugin[]): WorkflowExecutionGroup[] {
  const grouped = new Map<string, WorkflowExecutionGroup>();

  for (const resolved of plugins) {
    const key = workflowIdentity(resolved.plugin.workflow);
    const existing = grouped.get(key);
    if (existing) {
      existing.plugins.push(resolved);
      existing.minConfidence = Math.min(existing.minConfidence, resolved.config.minConfidence);
      existing.classFilter = mergeClassFilters(existing.plugins);
      continue;
    }
    grouped.set(key, {
      key,
      workflow: resolved.plugin.workflow,
      plugins: [resolved],
      minConfidence: resolved.config.minConfidence,
      classFilter: resolved.config.classes?.length ? [...resolved.config.classes] : undefined,
    });
  }

  return [...grouped.values()];
}

function mergeClassFilters(plugins: ResolvedPlugin[]): string[] | undefined {
  if (plugins.some((entry) => !entry.config.classes?.length)) return undefined;
  const labels = new Set<string>();
  for (const entry of plugins) {
    for (const label of entry.config.classes ?? []) labels.add(label.toLowerCase());
  }
  return [...labels];
}

export function filterDetectionsForPlugin<T extends { label: string; confidence: number }>(
  detections: T[],
  config: DevicePluginConfig,
): T[] {
  const labels = config.classes?.length ? new Set(config.classes.map((label) => label.toLowerCase())) : undefined;
  return detections.filter(
    (detection) =>
      detection.confidence >= config.minConfidence && (!labels || labels.has(detection.label.toLowerCase())),
  );
}

// ─── Rule evaluation ──────────────────────────────────────────────────────

export type ThresholdResult = {
  exceeded: boolean;
  count: number;
  threshold: number;
  operator: string;
  thresholdMode: string;
};

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

export function evaluateTransition(
  currentCount: number,
  previousCount: number | null,
  kind: "object-enters" | "object-leaves",
): boolean {
  if (previousCount === null) return false;
  if (kind === "object-enters") return previousCount === 0 && currentCount > 0;
  return previousCount > 0 && currentCount === 0;
}

export function countByLabelFilter(detections: Array<{ label: string }>, labels?: string[]): number {
  if (!labels || labels.length === 0) return detections.length;
  const labelSet = new Set(labels.map((label) => label.toLowerCase()));
  let count = 0;
  for (const detection of detections) {
    if (labelSet.has(detection.label.toLowerCase())) count += 1;
  }
  return count;
}

export function shouldRun(config: DevicePluginConfig, lastRunAt: Date | null, now: Date): boolean {
  if (!config.enabled) return false;
  if (!config.trigger || !lastRunAt) return true;
  const interval = (config.trigger.intervalSec ?? 600) * 1000;
  return now.getTime() - lastRunAt.getTime() >= interval;
}

export function isCooldownElapsed(lastEmittedAt: string | undefined, cooldownSec: number, now: Date): boolean {
  const previousTime = Date.parse(lastEmittedAt ?? "");
  if (!Number.isFinite(previousTime)) return true;
  return now.getTime() - previousTime >= Math.max(0, cooldownSec) * 1000;
}
