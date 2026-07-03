/**
 * Outcome-oriented CCTV intelligence plugin catalog.
 *
 * Staff install operational outcomes such as restricted-area protection or
 * loading-bay monitoring. Roboflow object detection and OpenRouter scene
 * understanding remain implementation details behind those outcomes.
 *
 * Per-camera configuration is stored on the facility device JSON at
 * `data.plugins`. Schema version 2 keeps the configuration forward-migratable.
 */

// ─── Catalog types ────────────────────────────────────────────────────────

export type PluginProvider = "openrouter" | "roboflow";
export type PluginKind = "segment-understanding" | "workflow-object-detection";
export type PluginCategory = "security" | "compliance" | "operations" | "hygiene" | "safety";
export type PluginTrigger = { mode: "segment"; intervalSec?: number };

export interface PluginWorkflowConfig {
  workspaceName: string;
  workflowId: string;
  inputName: string;
  dataOutputNames?: string[];
}

interface PluginBase {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  provider: PluginProvider;
  watchFor: string[];
  alertsWhen: string[];
  recommendedFor: string[];
  recommendedAction: string;
  defaultEvidence: PluginEvidenceConfig;
  legacy?: boolean;
  replacementId?: string;
}

export interface PluginEvidenceConfig {
  attachVideo: boolean;
  attachAnnotatedFrames: boolean;
  maxAnnotatedFrames: number;
}

export interface SegmentUnderstandingPlugin extends PluginBase {
  kind: "segment-understanding";
  provider: "openrouter";
  defaultPrompt: string;
  defaultAlerts: SceneAlertRule[];
  defaultCooldownSec: number;
}

export interface WorkflowObjectDetectionPlugin extends PluginBase {
  kind: "workflow-object-detection";
  provider: "roboflow";
  workflow: PluginWorkflowConfig;
  defaultClasses?: string[];
  defaultAlerts: DetectionAlertRule[];
  defaultConfidence: number;
  defaultCooldownSec: number;
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
  schemaVersion: 2;
  kind: K;
  pluginId: string;
  enabled: boolean;
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
  minConfidence: number;
  alertSeverity: AlertSeverity;
  classes?: string[];
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

// ─── Defaults ─────────────────────────────────────────────────────────────

export const PLUGIN_SCHEMA_VERSION = 2 as const;
export const DEFAULT_PLUGIN_CONFIDENCE = 0.4;
export const DEFAULT_COUNTING_OPERATOR = "gte" as const;
export const DEFAULT_COUNTING_THRESHOLD = 1;
export const DEFAULT_SEGMENT_PROMPT =
  "Review this CCTV clip for the configured operational risks. Describe only visible evidence and avoid guessing.";

const PERSON_LABELS = ["person"];
const VEHICLE_LABELS = ["vehicle", "car", "truck", "bus", "van"];
const DETECTION_EVIDENCE: PluginEvidenceConfig = {
  attachVideo: true,
  attachAnnotatedFrames: true,
  maxAnnotatedFrames: 3,
};
const SCENE_EVIDENCE: PluginEvidenceConfig = {
  attachVideo: true,
  attachAnnotatedFrames: false,
  maxAnnotatedFrames: 0,
};

// ─── Outcome catalog ──────────────────────────────────────────────────────

export const PLUGINS: Plugin[] = [
  {
    id: "restricted-area-protection",
    name: "Restricted Area Protection",
    description: "Protect sensitive areas by alerting when a person enters or remains visible in the camera view.",
    category: "security",
    kind: "workflow-object-detection",
    provider: "roboflow",
    watchFor: ["People entering the monitored area", "Unexpected occupancy"],
    alertsWhen: ["A person appears", "The configured occupancy limit is reached"],
    recommendedFor: ["Restricted areas", "Entry points", "Cold storage"],
    recommendedAction: "Verify authorization, contact security, and secure the affected area.",
    defaultEvidence: DETECTION_EVIDENCE,
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "people-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
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
    provider: "openrouter",
    watchFor: ["Hairnets and hair covering", "Face masks", "Required protective clothing"],
    alertsWhen: ["Required PPE is visibly missing or worn incorrectly"],
    recommendedFor: ["PPE checkpoints", "Food operations", "Tenant production areas"],
    recommendedAction: "Stop entry to the controlled area and correct the PPE violation.",
    defaultEvidence: SCENE_EVIDENCE,
    defaultPrompt:
      "Review this clip as a food-factory PPE compliance check. Report only clearly visible violations and identify the evidence.",
    defaultCooldownSec: 300,
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
    provider: "roboflow",
    watchFor: ["Vehicle arrivals and departures", "Bay occupancy", "Multiple waiting vehicles"],
    alertsWhen: ["A vehicle arrives or leaves", "More than one vehicle is present"],
    recommendedFor: ["Loading Bay 1", "Loading Bay 2", "Delivery approaches"],
    recommendedAction: "Confirm the bay assignment and coordinate waiting drivers if congestion is forming.",
    defaultEvidence: DETECTION_EVIDENCE,
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "vehicle-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
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
    provider: "openrouter",
    watchFor: ["Rodents and visible pests", "Spills or standing water", "Exposed or accumulated waste"],
    alertsWhen: ["A visible hygiene risk is present"],
    recommendedFor: ["Food operations", "Waste holding areas", "Loading bays"],
    recommendedAction: "Isolate the affected area and start the hygiene or pest-control response.",
    defaultEvidence: SCENE_EVIDENCE,
    defaultPrompt:
      "Review this clip for visible food-factory hygiene and pest risks. Report only observable evidence and its location.",
    defaultCooldownSec: 600,
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
    provider: "openrouter",
    watchFor: ["A fallen person", "Blocked emergency access", "Unsafe person and vehicle proximity"],
    alertsWhen: ["An immediate, visible safety hazard is present"],
    recommendedFor: ["Loading bays", "Parking", "Production corridors"],
    recommendedAction: "Pause nearby activity and dispatch the appropriate safety response.",
    defaultEvidence: SCENE_EVIDENCE,
    defaultPrompt:
      "Review this clip for immediate workplace safety hazards. Report only clearly visible hazards and supporting evidence.",
    defaultCooldownSec: 180,
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

/**
 * Existing cameras may still carry these configurations. They remain
 * resolvable and executable, but cannot be installed on new cameras.
 */
export const LEGACY_PLUGINS: Plugin[] = [
  {
    id: "natural-language",
    name: "Natural Language",
    description: "Legacy free-form scene analysis. Replace it with a purpose-built operational plugin.",
    category: "safety",
    kind: "segment-understanding",
    provider: "openrouter",
    watchFor: ["A free-form scene description"],
    alertsWhen: ["The configured description matches"],
    recommendedFor: [],
    recommendedAction: "Review the attached evidence and follow the configured response procedure.",
    defaultEvidence: SCENE_EVIDENCE,
    legacy: true,
    defaultPrompt: DEFAULT_SEGMENT_PROMPT,
    defaultCooldownSec: 300,
    defaultAlerts: [],
  },
  {
    id: "people-detection",
    name: "People Detection",
    description: "Legacy generic detector. Replace it with Restricted Area Protection.",
    category: "security",
    kind: "workflow-object-detection",
    provider: "roboflow",
    watchFor: ["People"],
    alertsWhen: ["A generic people rule matches"],
    recommendedFor: [],
    recommendedAction: "Review the detected person and verify whether intervention is required.",
    defaultEvidence: DETECTION_EVIDENCE,
    legacy: true,
    replacementId: "restricted-area-protection",
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "people-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
    defaultConfidence: DEFAULT_PLUGIN_CONFIDENCE,
    defaultCooldownSec: 300,
    defaultAlerts: [],
  },
  {
    id: "vehicle-detection",
    name: "Vehicle Detection",
    description: "Legacy generic detector. Replace it with Loading Bay Operations.",
    category: "operations",
    kind: "workflow-object-detection",
    provider: "roboflow",
    watchFor: ["Vehicles"],
    alertsWhen: ["A generic vehicle rule matches"],
    recommendedFor: [],
    recommendedAction: "Review the vehicle activity and verify the operational impact.",
    defaultEvidence: DETECTION_EVIDENCE,
    legacy: true,
    replacementId: "loading-bay-operations",
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "vehicle-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
    defaultConfidence: DEFAULT_PLUGIN_CONFIDENCE,
    defaultCooldownSec: 300,
    defaultAlerts: [],
  },
  {
    id: "object-detection",
    name: "Object Detection",
    description: "Legacy generic detector. Replace it with a purpose-built operational plugin.",
    category: "safety",
    kind: "workflow-object-detection",
    provider: "roboflow",
    watchFor: ["Configured object classes"],
    alertsWhen: ["A generic object rule matches"],
    recommendedFor: [],
    recommendedAction: "Review the detected object and verify whether intervention is required.",
    defaultEvidence: DETECTION_EVIDENCE,
    legacy: true,
    workflow: {
      workspaceName: "dentolos19",
      workflowId: "object-detection",
      inputName: "image",
      dataOutputNames: ["image", "predictions", "count"],
    },
    defaultConfidence: DEFAULT_PLUGIN_CONFIDENCE,
    defaultCooldownSec: 300,
    defaultAlerts: [],
  },
];

const PLUGIN_BY_ID = new Map([...PLUGINS, ...LEGACY_PLUGINS].map((plugin) => [plugin.id, plugin]));

export function getPlugin(id: string): Plugin | undefined {
  return PLUGIN_BY_ID.get(id);
}

export function isLegacyPlugin(plugin: Plugin): boolean {
  return plugin.legacy === true;
}

export function createPluginConfig(plugin: Plugin): DevicePluginConfig {
  if (plugin.kind === "segment-understanding") {
    const alerts =
      plugin.defaultAlerts.length > 0
        ? structuredClone(plugin.defaultAlerts)
        : [createDefaultSceneAlert(plugin.defaultPrompt)];
    return {
      schemaVersion: PLUGIN_SCHEMA_VERSION,
      kind: plugin.kind,
      pluginId: plugin.id,
      enabled: true,
      prompt: plugin.defaultPrompt,
      severity: alerts[0]?.severity ?? "warn",
      cooldownSec: plugin.defaultCooldownSec,
      evidence: { ...plugin.defaultEvidence },
      alerts,
    };
  }

  const alerts =
    plugin.defaultAlerts.length > 0
      ? structuredClone(plugin.defaultAlerts)
      : [
          {
            kind: "count-threshold" as const,
            enabled: true,
            threshold: DEFAULT_COUNTING_THRESHOLD,
            operator: DEFAULT_COUNTING_OPERATOR,
            thresholdMode: "max-per-frame" as const,
            severity: "warn" as const,
          },
        ];
  const thresholdRule = alerts.find((alert): alert is CountThresholdAlertRule => alert.kind === "count-threshold");

  return {
    schemaVersion: PLUGIN_SCHEMA_VERSION,
    kind: plugin.kind,
    pluginId: plugin.id,
    enabled: true,
    threshold: thresholdRule?.threshold ?? DEFAULT_COUNTING_THRESHOLD,
    operator: thresholdRule?.operator ?? DEFAULT_COUNTING_OPERATOR,
    thresholdMode: thresholdRule?.thresholdMode ?? "max-per-frame",
    minConfidence: plugin.defaultConfidence,
    alertSeverity: thresholdRule?.severity ?? alerts[0]?.severity ?? "warn",
    classes: plugin.defaultClasses ? [...plugin.defaultClasses] : undefined,
    cooldownSec: plugin.defaultCooldownSec,
    evidence: { ...plugin.defaultEvidence },
    alerts,
  };
}

// ─── Normalization and migration ──────────────────────────────────────────

function createDefaultSceneAlert(description: string): SceneMatchAlertRule {
  return { kind: "scene-match", enabled: true, description, severity: "warn" };
}

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
  const enabled = value.enabled === true;
  const trigger = normalizeTrigger(value.trigger);
  const cooldownSec = normalizeCooldown(value.cooldownSec) ?? defaults.cooldownSec;
  const evidence = normalizeEvidence(value.evidence, plugin.defaultEvidence);

  if (plugin.kind === "segment-understanding" && defaults.kind === "segment-understanding") {
    const prompt = typeof value.prompt === "string" && value.prompt.trim() ? value.prompt : defaults.prompt;
    const alerts = Array.isArray(value.alerts)
      ? value.alerts.map(normalizeSceneAlertRule).filter((alert): alert is SceneMatchAlertRule => alert !== null)
      : [];

    return {
      ...defaults,
      enabled,
      prompt,
      severity: normalizeSeverity(value.severity),
      alerts: alerts.length > 0 ? alerts : defaults.alerts,
      trigger,
      cooldownSec,
      evidence,
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
      ...defaults,
      enabled,
      threshold,
      operator,
      thresholdMode,
      minConfidence: normalizeConfidence(value.minConfidence, defaults.minConfidence),
      alertSeverity,
      classes: normalizeStringArray(value.classes) ?? defaults.classes,
      alerts:
        alerts.length > 0
          ? alerts
          : [
              {
                kind: "count-threshold",
                enabled: true,
                threshold,
                operator,
                thresholdMode,
                severity: alertSeverity,
              },
            ],
      trigger,
      cooldownSec,
      evidence,
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
