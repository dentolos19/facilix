/**
 * CCTV plugin catalog and per-device configuration.
 *
 * A **plugin** is a user-configurable package that performs analysis on
 * CCTV frames or segments. Each plugin declares a **kind** which tells
 * the Processor how to dispatch it:
 *
 * - `object-anomaly`      — Roboflow object detection → anomaly matching
 * - `object-counting`     — Roboflow object detection → counting → thresholds
 * - `segment-understanding` — OpenRouter video understanding → structured alert
 *
 * Plugins are the single source of truth: if a CCTV has no enabled
 * plugins, no Roboflow calls are made and no events are raised.
 *
 * Per-CCTV plugin configuration is stored on the device row's JSON
 * `data.plugins` field.
 */

import type { Detection } from "./detection";

// ─── Basic types ──────────────────────────────────────────────────────────

/** Lower-case class id used for filtering and storage. */
export type OptionId = string;

/** Curated, user-selectable option for a plugin (e.g. a Roboflow class). */
export interface PluginOption {
  /** Stable, lower-case identifier (e.g. "no-safety-vest", "vehicle-count"). */
  id: OptionId;
  /** Human-readable label shown in the UI (e.g. "No Safety Vest"). */
  label: string;
  /** Roboflow class names (case-insensitive) that map to this option. */
  classNames: string[];
}

/** Source that powers the plugin's inference. */
export type PluginProvider = "roboflow" | "openrouter";

/** How a plugin analyses media. */
export type PluginKind = "object-anomaly" | "object-counting" | "segment-understanding";

/** Per-plugin trigger policy. */
export type PluginTrigger = { mode: "frame" } | { mode: "segment"; intervalSec?: number };

/** A curated plugin available in the catalog. */
export interface Plugin {
  id: string;
  name: string;
  description: string;
  kind: PluginKind;
  provider: PluginProvider;
  /** Roboflow model id in the form `project/version` (only for roboflow plugins). */
  modelId?: string;
  /** User-selectable options (only for roboflow plugins). */
  options: PluginOption[];
  /** Env var key to read for model ID override (roboflow only). */
  modelEnv?: string;
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

/** Config for `object-anomaly` plugins. */
export interface ObjectAnomalyDeviceConfig extends DevicePluginConfigBase {
  selectedAnomalies: OptionId[];
  confidence: number;
}

/** Config for `object-counting` plugins. */
export interface ObjectCountingDeviceConfig extends DevicePluginConfigBase {
  selectedSignals: OptionId[];
  confidence: number;
  threshold: number;
  operator: "gt" | "gte" | "lt" | "lte" | "eq";
}

/** Config for `segment-understanding` plugins. */
export interface SegmentAnalysisDeviceConfig extends DevicePluginConfigBase {
  prompt: string;
  severity: "info" | "warn" | "error";
}

/** Union of all per-device configs. */
export type DevicePluginConfig = ObjectAnomalyDeviceConfig | ObjectCountingDeviceConfig | SegmentAnalysisDeviceConfig;

/** Plugin + per-device config resolved for inference. */
export interface ResolvedPlugin<T extends DevicePluginConfig = DevicePluginConfig> {
  plugin: Plugin;
  config: T;
  classNames: Set<string>;
}

/** Per-detection plugin lookup result. */
export interface AlertMatch {
  plugin: Plugin;
  option: PluginOption;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_PLUGIN_CONFIDENCE = 0.4;
export const DEFAULT_COUNTING_OPERATOR = "gte" as const;
export const DEFAULT_COUNTING_THRESHOLD = 5;
export const DEFAULT_SEGMENT_PROMPT =
  "Analyze this CCTV clip for anomalies, safety violations, or unusual activity. " +
  'Respond in JSON format: { "alert": boolean, "severity": "info"|"warn"|"error", ' +
  '"message": string, "summary": string }.';

// ─── Curated catalog ──────────────────────────────────────────────────────

export const PLUGINS: Plugin[] = [
  {
    id: "ppe-compliance",
    name: "PPE Compliance",
    description: "Detects missing personal protective equipment (PPE) on workers in the frame.",
    kind: "object-anomaly",
    provider: "roboflow",
    modelId: "ppes-kaxsi/8",
    modelEnv: "ROBOFLOW_PPE_MODEL_ID",
    options: [
      { id: "no-safety-vest", label: "No Safety Vest", classNames: ["no-safety-vest", "no-safety vest", "no-vest"] },
      { id: "no-mask", label: "No Mask", classNames: ["no-mask"] },
      { id: "no-gloves", label: "No Gloves", classNames: ["no-gloves"] },
      { id: "no-hardhat", label: "No Hardhat", classNames: ["no-hardhat", "no-hard-hat"] },
      { id: "no-boots", label: "No Boots", classNames: ["no-boots"] },
    ],
  },
  {
    id: "vehicle-parking",
    name: "Vehicle Parking",
    description: "Counts vehicles in the frame and alerts when the count exceeds or drops below a threshold.",
    kind: "object-counting",
    provider: "roboflow",
    modelId: "vehicles-q0x2v/1",
    modelEnv: "ROBOFLOW_VEHICLE_MODEL_ID",
    options: [
      { id: "vehicle-count", label: "Total vehicle count", classNames: ["car", "truck", "bus", "motorcycle", "van"] },
      { id: "cars", label: "Cars only", classNames: ["car"] },
      { id: "trucks", label: "Trucks / vans / buses", classNames: ["truck", "van", "bus"] },
    ],
  },
  {
    id: "people-detection",
    name: "People Detection",
    description: "Counts people in the frame and alerts when the count crosses a configured threshold.",
    kind: "object-counting",
    provider: "roboflow",
    modelId: "cctv-naxyo/1",
    modelEnv: "ROBOFLOW_PEOPLE_MODEL_ID",
    options: [{ id: "people-count", label: "Number of people", classNames: ["person"] }],
  },
  {
    id: "natural-language",
    name: "Natural Language",
    description: "Uses AI video understanding to watch for anomalies described in natural language.",
    kind: "segment-understanding",
    provider: "openrouter",
    defaultPrompt: DEFAULT_SEGMENT_PROMPT,
    options: [],
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

  switch (plugin.kind) {
    case "object-anomaly": {
      const confidence = normalizeConfidence(r.confidence);
      const rawAnoms = Array.isArray(r.selectedAnomalies) ? r.selectedAnomalies : [];
      const validIds = new Set(plugin.options.map((o) => o.id));
      const selectedAnomalies = rawAnoms
        .filter((a): a is string => typeof a === "string")
        .filter((id) => validIds.has(id));
      return { pluginId, enabled, selectedAnomalies, confidence, trigger, cooldownSec };
    }
    case "object-counting": {
      const confidence = normalizeConfidence(r.confidence);
      const rawSignals = Array.isArray(r.selectedSignals) ? r.selectedSignals : [];
      const validSignalIds = new Set(plugin.options.map((o) => o.id));
      const selectedSignals = rawSignals
        .filter((a): a is string => typeof a === "string")
        .filter((id) => validSignalIds.has(id));
      const threshold = normalizeNumber(r.threshold, DEFAULT_COUNTING_THRESHOLD);
      const operator = normalizeOperator(r.operator);
      return { pluginId, enabled, selectedSignals, confidence, threshold, operator, trigger, cooldownSec };
    }
    case "segment-understanding": {
      const prompt =
        typeof r.prompt === "string" && r.prompt.length > 0
          ? r.prompt
          : (plugin.defaultPrompt ?? DEFAULT_SEGMENT_PROMPT);
      const severity = (["info", "warn", "error"] as const).includes(r.severity as never)
        ? (r.severity as SegmentAnalysisDeviceConfig["severity"])
        : "warn";
      return { pluginId, enabled, prompt, severity, trigger, cooldownSec };
    }
    default:
      return null;
  }
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

function normalizeOperator(value: unknown): ObjectCountingDeviceConfig["operator"] {
  const valid = ["gt", "gte", "lt", "lte", "eq"] as const;
  return valid.includes(value as never) ? (value as ObjectCountingDeviceConfig["operator"]) : DEFAULT_COUNTING_OPERATOR;
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

    let classNames = new Set<string>();
    if ("selectedAnomalies" in config && (config as ObjectAnomalyDeviceConfig).selectedAnomalies.length > 0) {
      classNames = classNamesForOptions(plugin, (config as ObjectAnomalyDeviceConfig).selectedAnomalies);
    } else if ("selectedSignals" in config && (config as ObjectCountingDeviceConfig).selectedSignals.length > 0) {
      classNames = classNamesForOptions(plugin, (config as ObjectCountingDeviceConfig).selectedSignals);
    } else if (plugin.kind === "segment-understanding") {
      classNames = new Set();
    }

    if (classNames.size === 0 && plugin.kind !== "segment-understanding") continue;

    out.push({ plugin, config: config as never, classNames });
  }
  return out;
}

function classNamesForOptions(plugin: Plugin, selectedIds: string[]): Set<string> {
  const selectedSet = new Set(selectedIds);
  const out = new Set<string>();
  for (const opt of plugin.options) {
    if (!selectedSet.has(opt.id)) continue;
    for (const cls of opt.classNames) out.add(cls.toLowerCase());
  }
  return out;
}

// ─── Detection matching ────────────────────────────────────────────────────

/** Find the matching plugin option for a detection label. */
export function findAlertMatch(resolved: ResolvedPlugin[], detection: Detection): AlertMatch | null {
  const label = (detection.label ?? "").toLowerCase();
  if (!label) return null;
  for (const r of resolved) {
    if (r.plugin.kind !== "object-anomaly") continue;
    if (!r.classNames.has(label)) continue;
    for (const opt of r.plugin.options) {
      if (opt.classNames.some((c) => c.toLowerCase() === label)) {
        return { plugin: r.plugin, option: opt };
      }
    }
  }
  return null;
}

/** Aggregate detection counts per counting plugin. */
export function countByClassGroup(
  resolved: ResolvedPlugin[],
  detections: Detection[],
): Map<string, { plugin: ResolvedPlugin; count: number; config: ObjectCountingDeviceConfig }> {
  const result = new Map<string, { plugin: ResolvedPlugin; count: number; config: ObjectCountingDeviceConfig }>();
  for (const r of resolved) {
    if (r.plugin.kind !== "object-counting") continue;
    const config = r.config as ObjectCountingDeviceConfig;
    let count = 0;
    for (const d of detections) {
      if (r.classNames.has(d.label.toLowerCase())) count++;
    }
    result.set(r.plugin.id, { plugin: r, count, config });
  }
  return result;
}

/** Check whether a count crosses the configured threshold. */
export function thresholdExceeded(count: number, config: ObjectCountingDeviceConfig): boolean {
  const { threshold, operator } = config;
  switch (operator) {
    case "gt":
      return count > threshold;
    case "gte":
      return count >= threshold;
    case "lt":
      return count < threshold;
    case "lte":
      return count <= threshold;
    case "eq":
      return count === threshold;
  }
}

// ─── Trigger helpers ──────────────────────────────────────────────────────

/** Determine if a plugin should run based on its trigger and last run time. */
export function shouldRun(config: DevicePluginConfig, lastRunAt: Date | null, now: Date): boolean {
  if (!config.enabled) return false;
  const trigger = config.trigger;
  if (!trigger) return true;
  if (trigger.mode === "frame") return true;
  if (trigger.mode === "segment") {
    if (!lastRunAt) return true;
    const interval = (trigger.intervalSec ?? 600) * 1000;
    return now.getTime() - lastRunAt.getTime() >= interval;
  }
  return true;
}
