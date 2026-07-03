import { describe, expect, test } from "bun:test";

import { selectRepresentativeFrames, type StoredPredictionOutputRef } from "./event-evidence";

const frames: StoredPredictionOutputRef[] = [
  { beforeAssetId: "before-0", afterAssetId: "after-0", frameIndex: 0, atSec: 0 },
  { beforeAssetId: "before-30", afterAssetId: "after-30", frameIndex: 30, atSec: 1 },
  { beforeAssetId: "before-60", afterAssetId: "after-60", frameIndex: 60, atSec: 2 },
];

describe("event evidence selection", () => {
  test("uses the earliest matching frames for entry alerts", () => {
    const selected = selectRepresentativeFrames(
      frames,
      [
        { label: "person", confidence: 0.8, frameIndex: 30 },
        { label: "person", confidence: 0.95, frameIndex: 60 },
      ],
      { kind: "object-enters", labels: ["person"] },
      2,
    );

    expect(selected.map((frame) => frame.frameIndex)).toEqual([30, 60]);
  });

  test("uses the densest frame for occupancy alerts", () => {
    const selected = selectRepresentativeFrames(
      frames,
      [
        { label: "truck", confidence: 0.91, frameIndex: 0 },
        { label: "truck", confidence: 0.75, frameIndex: 30 },
        { label: "truck", confidence: 0.8, frameIndex: 30 },
      ],
      { kind: "count-threshold", labels: ["truck"] },
      1,
    );

    expect(selected[0]?.frameIndex).toBe(30);
  });

  test("does not attach a misleading current frame to departure or scene alerts", () => {
    const detections = [{ label: "truck", confidence: 0.9, frameIndex: 30 }];
    expect(selectRepresentativeFrames(frames, detections, { kind: "object-leaves" }, 3)).toEqual([]);
    expect(selectRepresentativeFrames(frames, detections, { kind: "scene-match" }, 3)).toEqual([]);
  });

  test("caps annotated images at three", () => {
    const selected = selectRepresentativeFrames(
      frames,
      frames.map((frame) => ({ label: "person", confidence: 0.8, frameIndex: frame.frameIndex })),
      { kind: "count-threshold" },
      10,
    );
    expect(selected).toHaveLength(3);
  });

  test("uses persisted prediction summaries when aggregate frame matching is unavailable", () => {
    const selected = selectRepresentativeFrames(
      [
        {
          beforeAssetId: "before-30",
          afterAssetId: "after-30",
          frameIndex: 30,
          atSec: 1,
          predictionCount: 1,
          labels: ["person"],
          maxConfidence: 0.94,
        },
      ],
      [{ label: "person", confidence: 0.94 }],
      { kind: "object-enters", labels: ["person"] },
      3,
    );

    expect(selected.map((frame) => frame.afterAssetId)).toEqual(["after-30"]);
  });
});
