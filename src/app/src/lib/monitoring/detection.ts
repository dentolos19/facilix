/**
 * Shared CCTV object-detection constants used by both the monitoring API
 * (`monitoring/api.ts`) and the durable Processor workflow
 * (`bindings/processor.ts`).
 */

/** Minimum DETR confidence score retained as a detection. */
export const MIN_CONFIDENCE = 0.4;

/** Object classes that are escalated as anomalies (DO + D1). Everything else is observation-only. */
export const ANOMALY_CLASSES = new Set([
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "bus",
  "truck",
  "backpack",
  "handbag",
  "suitcase",
  "knife",
  "cell phone",
]);

/** DETR bounding box in absolute pixel coordinates. */
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
};
