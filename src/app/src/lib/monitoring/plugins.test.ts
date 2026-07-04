import { describe, expect, test } from "bun:test";

import {
  createPluginConfig,
  evaluateCountThreshold,
  evaluateTransition,
  filterDetectionsForPlugin,
  getPlugin,
  groupPluginsByWorkflow,
  isCooldownElapsed,
  normalizePlugins,
  PLUGINS,
  resolveEnabledPlugins,
} from "./plugins";

describe("outcome-oriented intelligence plugins", () => {
  test("replaces the installable generic catalog with operational outcomes", () => {
    expect(PLUGINS.map((plugin) => plugin.id)).toEqual([
      "restricted-area-protection",
      "ppe-compliance",
      "loading-bay-operations",
      "hygiene-pest-watch",
      "workplace-safety",
    ]);
    expect(PLUGINS.every((plugin) => plugin.watchFor.length > 0 && plugin.alertsWhen.length > 0)).toBe(true);
    expect(PLUGINS.every((plugin) => plugin.provider === "roboflow" && plugin.workflow.workflowId.length > 0)).toBe(
      true,
    );
  });

  test("creates practical restricted-area defaults", () => {
    const plugin = getPlugin("restricted-area-protection");
    if (!plugin) throw new Error("missing restricted-area plugin");

    const config = createPluginConfig(plugin);
    expect(config.schemaVersion).toBe(3);
    expect(config.enabled).toBe(true);
    expect(config.cooldownSec).toBe(300);
    expect(config.evidence).toEqual({
      attachVideo: true,
      attachAnnotatedFrames: true,
      maxAnnotatedFrames: 3,
    });
    expect(config.kind).toBe("workflow-object-detection");
    if (config.kind !== "workflow-object-detection") throw new Error("unexpected config kind");
    expect(config.classes).toEqual(["person"]);
    expect(config.alerts.map((alert) => alert.kind)).toEqual(["object-enters", "count-threshold"]);
  });

  test("completely removes legacy generic configurations", () => {
    const configs = normalizePlugins([
      {
        pluginId: "people-detection",
        enabled: true,
      },
      { pluginId: "vehicle-detection", enabled: true },
      { pluginId: "object-detection", enabled: true },
      { pluginId: "natural-language", enabled: true },
    ]);

    expect(configs).toEqual([]);
    expect(getPlugin("people-detection")).toBeUndefined();
    expect(getPlugin("natural-language")).toBeUndefined();
  });

  test("normalizes purpose-built scene rules", () => {
    const [config] = normalizePlugins([
      {
        pluginId: "ppe-compliance",
        enabled: true,
        alerts: [
          {
            kind: "scene-match",
            description: "A person is missing a hairnet.",
            severity: "error",
          },
        ],
      },
    ]);

    expect(config?.kind).toBe("segment-understanding");
    if (!config || config.kind !== "segment-understanding") throw new Error("unexpected config kind");
    expect(config.schemaVersion).toBe(3);
    expect(config.minConfidence).toBe(0.4);
    expect(config.alerts).toEqual([
      {
        kind: "scene-match",
        enabled: true,
        description: "A person is missing a hairnet.",
        severity: "error",
      },
    ]);
  });

  test("groups plugins that share a workflow into one inference pass", () => {
    const configs = ["ppe-compliance", "hygiene-pest-watch", "workplace-safety"].map((pluginId) => {
      const plugin = getPlugin(pluginId);
      if (!plugin) throw new Error(`missing ${pluginId}`);
      return createPluginConfig(plugin);
    });
    const groups = groupPluginsByWorkflow(resolveEnabledPlugins(configs));

    expect(groups).toHaveLength(1);
    expect(groups[0].workflow.workflowId).toBe("object-detection");
    expect(groups[0].plugins).toHaveLength(3);
    expect(groups[0].classFilter).toBeUndefined();
  });

  test("filters a shared workflow result for each plugin", () => {
    const plugin = getPlugin("restricted-area-protection");
    if (!plugin) throw new Error("missing restricted-area plugin");
    const config = createPluginConfig(plugin);
    const detections = filterDetectionsForPlugin(
      [
        { label: "person", confidence: 0.9 },
        { label: "person", confidence: 0.3 },
        { label: "car", confidence: 0.9 },
      ],
      config,
    );

    expect(detections).toEqual([{ label: "person", confidence: 0.9 }]);
  });
});

describe("plugin alert policies", () => {
  test("evaluates occupancy thresholds and transitions", () => {
    expect(
      evaluateCountThreshold(2, {
        kind: "count-threshold",
        enabled: true,
        threshold: 2,
        operator: "gte",
        thresholdMode: "max-per-frame",
        severity: "warn",
      }).exceeded,
    ).toBe(true);
    expect(evaluateTransition(1, 0, "object-enters")).toBe(true);
    expect(evaluateTransition(0, 1, "object-leaves")).toBe(true);
    expect(evaluateTransition(1, null, "object-enters")).toBe(false);
  });

  test("enforces cooldown from the last emitted alert", () => {
    const now = new Date("2026-07-02T10:05:00.000Z");
    expect(isCooldownElapsed("2026-07-02T10:01:00.000Z", 300, now)).toBe(false);
    expect(isCooldownElapsed("2026-07-02T10:00:00.000Z", 300, now)).toBe(true);
    expect(isCooldownElapsed(undefined, 300, now)).toBe(true);
  });
});
