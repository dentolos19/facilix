export interface StoredPredictionOutputRef {
  beforeAssetId: string;
  afterAssetId: string;
  frameIndex: number;
  atSec: number;
  predictionCount?: number;
  labels?: string[];
  maxConfidence?: number;
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
 * Choose one representative frame pair for vision-language analysis. Prefer a
 * frame with the most Roboflow evidence, then confidence, then the frame
 * nearest the middle of the sampled clip.
 */
export function selectAnalysisContextFrame(frames: StoredPredictionOutputRef[]): StoredPredictionOutputRef | null {
  if (frames.length === 0) return null;
  const ordered = [...frames].sort((left, right) => left.frameIndex - right.frameIndex);
  const middleFrame = (ordered[0].frameIndex + ordered[ordered.length - 1].frameIndex) / 2;
  return [...ordered].sort(
    (left, right) =>
      (right.predictionCount ?? 0) - (left.predictionCount ?? 0) ||
      (right.maxConfidence ?? 0) - (left.maxConfidence ?? 0) ||
      Math.abs(left.frameIndex - middleFrame) - Math.abs(right.frameIndex - middleFrame),
  )[0];
}

/**
 * Pick a small, stable evidence set without returning image bytes through a
 * Workflow step. Entry alerts prefer the earliest matching frames; occupancy
 * alerts prefer frames with the strongest concentration of detections.
 */
export function selectRepresentativeFrames(
  frames: StoredPredictionOutputRef[],
  detections: EvidenceDetection[],
  alert: EvidenceAlertDescriptor,
  limit: number,
): StoredPredictionOutputRef[] {
  if (limit <= 0 || alert.kind === "object-leaves") return [];
  if (alert.kind === "scene-match") {
    const context = selectAnalysisContextFrame(frames);
    return context ? [context] : [];
  }

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

  // Workflow retries created before attachment support may not preserve every
  // aggregate detection/frame association. The lightweight persisted-output
  // summary still tells us which annotated frames contain relevant boxes.
  for (const frame of frames) {
    if (scoreByFrame.has(frame.frameIndex) || !frame.predictionCount) continue;
    const frameLabels = new Set((frame.labels ?? []).map((label) => label.toLowerCase()));
    if (labels.size > 0 && ![...labels].some((label) => frameLabels.has(label))) continue;
    scoreByFrame.set(frame.frameIndex, {
      count: frame.predictionCount,
      confidence: frame.maxConfidence ?? 0,
    });
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
