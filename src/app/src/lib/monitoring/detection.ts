/**
 * Shared CCTV object-detection types.
 *
 * The detection pipeline is driven by Roboflow hosted inference. Each
 * CCTV device opts into one or more **anomaly plugins** (see
 * `./plugins.ts`) which list the user-configurable anomaly
 * classes that should generate alerts. There is no global anomaly
 * class list anymore — plugins are the single source of truth.
 *
 * This module only defines the neutral `Detection` shape used to
 * normalise Roboflow predictions before they are filtered by the
 * plugin matching logic in the processor.
 */

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
