/**
 * Shared CCTV object-detection constants used by both the monitoring API
 * (`monitoring/api.ts`) and the durable Processor workflow
 * (`bindings/processor.ts`).
 *
 * The detection pipeline is now driven by Roboflow hosted inference.
 * Two models are queried per frame and their results are merged:
 *   - `cctv-naxyo/1`  — generic people detection
 *   - `ppes-kaxsi/8`  — PPE (hardhat / vest / etc.) detection
 *
 * Both return predictions shaped as:
 *   { x, y, width, height, confidence, class, class_id, ... }
 * which the Roboflow helper (`monitoring/roboflow.ts`) normalises into
 * the `Detection` shape used downstream.
 */

/** Minimum Roboflow confidence score retained as a detection. */
export const MIN_CONFIDENCE = 0.4;

/**
 * Object classes that are escalated as anomalies (DO + D1).
 * Everything else is recorded in the detection counts but kept at
 * "info" severity. Labels are matched case-insensitively.
 */
export const ANOMALY_CLASSES = new Set([
  // People model (`cctv-naxyo/1`) — any person is noteworthy
  "person",

  // PPE model (`ppes-kaxsi/8`) — workers, plus "no"-prefixed negatives
  // (e.g. "no-hardhat", "no-safety vest") so that missing PPE escalates.
  "worker",
  "hardhat",
  "safety-vest",
  "safety vest",
  "vest",
  "no-hardhat",
  "no-hard-hat",
  "no-safety-vest",
  "no-safety vest",
  "no-vest",
  "no-mask",
  "mask",
  "gloves",
  "no-gloves",
  "boots",
  "no-boots",
]);

/** Roboflow bounding box in absolute pixel coordinates (top-left + bottom-right). */
export type DetectionBox = {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
};

export type Detection = {
  label: string;
  confidence: number;
  box?: DetectionBox;
  /** Which Roboflow model produced the prediction. */
  modelId?: string;
  /** Roboflow class id (optional). */
  classId?: number;
};
