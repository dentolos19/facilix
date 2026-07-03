import { describe, expect, test } from "bun:test";

import {
  createPluginConfig,
  evaluateCountThreshold,
  evaluateTransition,
  getPlugin,
  isCooldownElapsed,
  isLegacyPlugin,
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
  });

  test("creates practical restricted-area defaults", () => {
    const plugin = getPlugin("restricted-area-protection");
    if (!plugin) throw new Error("missing restricted-area plugin");

    const config = createPluginConfig(plugin);
    expect(config.schemaVersion).toBe(2);
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

  test("keeps existing generic configurations resolvable as legacy", () => {
    const [config] = normalizePlugins([
      {
        pluginId: "people-detection",
        enabled: true,
        minConfidence: 0.7,
        threshold: 2,
        operator: "gte",
        thresholdMode: "max-per-frame",
        alertSeverity: "error",
      },
    ]);

    expect(config?.schemaVersion).toBe(2);
    expect(config?.pluginId).toBe("people-detection");
    expect(isLegacyPlugin(getPlugin("people-detection")!)).toBe(true);
    expect(getPlugin("people-detection")?.replacementId).toBe("restricted-area-protection");
    expect(resolveEnabledPlugins(config ? [config] : [])).toHaveLength(1);
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
    expect(config.alerts).toEqual([
      {
        kind: "scene-match",
        enabled: true,
        description: "A person is missing a hairnet.",
        severity: "error",
      },
    ]);
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
