export interface StoredPredictionMediaRef {
  beforeAssetId: string;
  afterAssetId: string;
  frameIndex: number;
  atSec: number;
}

export interface EvidenceDetection {
  label: string;
  confidence: number;
  frameIndex?: number;
}

export interface EvidenceAlertDescriptor {
  kind: "count-threshold" | "object-enters" | "object-leaves" | "scene-match";
  labels?: string[];
}

/**
 * Pick a small, stable evidence set without returning image bytes through a
 * Workflow step. Entry alerts prefer the earliest matching frames; occupancy
 * alerts prefer frames with the strongest concentration of detections.
 */
export function selectRepresentativeFrames(
  frames: StoredPredictionMediaRef[],
  detections: EvidenceDetection[],
  alert: EvidenceAlertDescriptor,
  limit: number,
): StoredPredictionMediaRef[] {
  if (limit <= 0 || alert.kind === "object-leaves" || alert.kind === "scene-match") return [];

  const labels = new Set((alert.labels ?? []).map((label) => label.toLowerCase()));
  const scoreByFrame = new Map<number, { count: number; confidence: number }>();

  for (const detection of detections) {
    if (detection.frameIndex === undefined) continue;
    if (labels.size > 0 && !labels.has(detection.label.toLowerCase())) continue;
    const score = scoreByFrame.get(detection.frameIndex) ?? { count: 0, confidence: 0 };
    score.count += 1;
    score.confidence = Math.max(score.confidence, detection.confidence);
    scoreByFrame.set(detection.frameIndex, score);
  }

  const candidates = frames.filter((frame) => scoreByFrame.has(frame.frameIndex));
  candidates.sort((left, right) => {
    if (alert.kind === "object-enters") return left.frameIndex - right.frameIndex;
    const leftScore = scoreByFrame.get(left.frameIndex)!;
    const rightScore = scoreByFrame.get(right.frameIndex)!;
    return (
      rightScore.count - leftScore.count ||
      rightScore.confidence - leftScore.confidence ||
      left.frameIndex - right.frameIndex
    );
  });

  return candidates.slice(0, Math.min(3, Math.floor(limit)));
}
