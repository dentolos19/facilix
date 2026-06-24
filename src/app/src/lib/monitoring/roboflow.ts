/**
 * Roboflow Workflow video client.
 *
 * Uses the Roboflow REST API (`POST /{workspace}/workflows/{workflow}`) to run workflow
 * object detection on uploaded video segments. The SDK's built-in WebRTC
 * transport (`webrtc.useVideoFile`) requires browser-level RTCPeerConnection
 * globals that are unavailable in Cloudflare Workers, so we bypass the SDK
 * entirely and call the serverless endpoint directly.
 */

import type { PluginWorkflowConfig } from "./plugins";

/** A normalized object detection result from the workflow. */
export interface WorkflowDetection {
  /** Detected class label (lowercase). */
  label: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Bounding box in absolute pixel coordinates (top-left + bottom-right). */
  box?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  /** Timestamp in seconds within the video segment (if available). */
  atSec?: number;
  /** Frame index within the video (if available). */
  frameIndex?: number;
  /** Tracking ID for multi-frame tracking (if available). */
  trackId?: string;
  /** Roboflow class ID (if available). */
  classId?: number;
}

/** Raw Roboflow workflow prediction shape. */
interface WorkflowPrediction {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  confidence?: number;
  class?: string;
  class_id?: number;
  detection_id?: string;
  time?: number;
  timestamp?: number;
  frame_index?: number;
  frame_id?: number;
  tracker_id?: string;
  track_id?: string;
  [key: string]: unknown;
}

/** Runtime settings for the Roboflow workflow (shared across all plugins). */
export interface WorkflowRuntimeConfig {
  processingTimeoutSec: number;
  requestedPlan: string;
  requestedRegion: string;
}

/** Get shared runtime settings. */
export function getRuntimeConfig(): WorkflowRuntimeConfig {
  return {
    processingTimeoutSec: 3600,
    requestedPlan: "webrtc-gpu-medium",
    requestedRegion: "us",
  };
}

/** Options for running video object detection. */
export interface RunVideoDetectionOptions {
  /** The video segment bytes (MP4). */
  segmentBytes: Uint8Array;
  /** The workflow identity from the plugin catalog. */
  pluginWorkflow: PluginWorkflowConfig;
  /** The facility ID to get the container stub. */
  facilityId: string;
  /** Minimum confidence threshold for detections. */
  minConfidence?: number;
  /** If set, only these class labels are kept after detection. */
  classFilter?: string[];
  /** The Durable Object namespace for getting the container stub. */
  serverNamespace: DurableObjectNamespace;
}

class NonRetryableRoboflowError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NonRetryableRoboflowError";
  }
}

/**
 * Run a specific Roboflow workflow on a video segment via the Python backend.
 *
 * The Python backend (running in a Cloudflare Container) extracts frames using
 * OpenCV and calls the Roboflow REST API for each frame. This avoids the WebRTC
 * requirement that's unavailable in Cloudflare Workers.
 *
 * @returns Array of normalized detections, optionally filtered by confidence and class.
 */
export async function runVideoObjectDetection(options: RunVideoDetectionOptions): Promise<WorkflowDetection[]> {
  const {
    segmentBytes,
    pluginWorkflow,
    facilityId,
    minConfidence = 0.4,
    classFilter,
    serverNamespace,
  } = options;

  const containerStub = serverNamespace.getByName(facilityId);

  // Build the URL with query parameters
  const params = new URLSearchParams({
    workspace_name: pluginWorkflow.workspaceName,
    workflow_id: pluginWorkflow.workflowId,
    input_name: pluginWorkflow.inputName,
    frame_interval: "30",
    min_confidence: String(minConfidence),
  });

  const url = `http://localhost:3001/process-video?${params.toString()}`;
  const body = new ArrayBuffer(segmentBytes.byteLength);
  new Uint8Array(body).set(segmentBytes);

  // Retry with exponential backoff (no AbortSignal — step timeout handles cancellation)
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await containerStub.containerFetch(url, {
        method: "POST",
        headers: { "Content-Type": "video/mp4" },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const message = `Python backend error (${response.status}): ${errorText}`;
        if (response.status >= 400 && response.status < 500) {
          throw new NonRetryableRoboflowError(message, response.status);
        }
        throw new Error(message);
      }

      const result: unknown = await response.json();
      let detections = parseWorkflowResponse(result, pluginWorkflow);

      // Apply confidence filter
      detections = detections.filter((d) => d.confidence >= minConfidence);

      // Apply class filter
      if (classFilter && classFilter.length > 0) {
        const allowedLabels = new Set(classFilter.map((l) => l.toLowerCase()));
        detections = detections.filter((d) => allowedLabels.has(d.label));
      }

      return detections;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof NonRetryableRoboflowError) {
        throw err;
      }
      if (attempt === maxRetries) {
        throw lastError;
      }
      // Exponential backoff: 1s, 2s
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  throw lastError ?? new Error("Unknown error in runVideoObjectDetection");
}

// ── REST response parsing ──────────────────────────────────────────────────

/** Normalise the various shapes the Roboflow REST API may return. */
function parseWorkflowResponse(result: unknown, pluginWorkflow: PluginWorkflowConfig): WorkflowDetection[] {
  if (!result || typeof result !== "object") return [];

  const obj = result as Record<string, unknown>;

  // Python backend returns: { detections: [...], count: N }
  if (Array.isArray(obj.detections)) {
    return obj.detections
      .filter(isRecord)
      .map((d) => toDetection(d, {}))
      .filter((d): d is WorkflowDetection => d !== null);
  }

  // Roboflow REST API shapes (fallback):
  //   { outputs: [ { predictions: [...], image: … } ] }
  //   { output:  { predictions: [...], image: … }   }
  //   { predictions: [...] }                          (single-image shorthand)
  const outputs: Record<string, unknown>[] = Array.isArray(obj.outputs)
    ? (obj.outputs as Record<string, unknown>[])
    : obj.output && typeof obj.output === "object"
      ? [obj.output as Record<string, unknown>]
      : Array.isArray(obj.predictions)
        ? [obj as Record<string, unknown>]
        : [obj];

  const dataOutputNames = new Set(pluginWorkflow.dataOutputNames ?? [pluginWorkflow.inputName, "predictions", "count"]);

  const detections: WorkflowDetection[] = [];

  for (const output of outputs) {
    for (const [name, value] of Object.entries(output)) {
      if (name === "count") continue;
      if (!dataOutputNames.has(name)) continue;

      const predictions = extractPredictions(value);
      for (const prediction of predictions) {
        const detection = toDetection(prediction, {});
        if (detection) detections.push(detection);
      }
    }
  }

  return detections;
}

function extractPredictions(value: unknown): WorkflowPrediction[] {
  if (Array.isArray(value)) return value.filter(isRecord) as WorkflowPrediction[];
  if (!isRecord(value)) return [];

  if (Array.isArray(value.value)) return value.value.filter(isRecord) as WorkflowPrediction[];
  if (isRecord(value.value)) return extractPredictions(value.value);

  if (Array.isArray(value.predictions)) return value.predictions.filter(isRecord) as WorkflowPrediction[];
  if (isRecord(value.predictions)) return extractPredictions(value.predictions);

  if (Array.isArray(value.detections)) return value.detections.filter(isRecord) as WorkflowPrediction[];
  if (isRecord(value.detections)) return extractPredictions(value.detections);

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** Normalize a Roboflow workflow prediction into our shared detection shape. */
function toDetection(
  p: WorkflowPrediction,
  fallback: { frameIndex?: number; atSec?: number },
): WorkflowDetection | null {
  if (typeof p.confidence !== "number") return null;

  const label = String(p.class ?? "unknown").toLowerCase();
  const confidence = p.confidence;

  let box: WorkflowDetection["box"] | undefined;
  if (
    typeof p.x === "number" &&
    typeof p.y === "number" &&
    typeof p.width === "number" &&
    typeof p.height === "number"
  ) {
    box = {
      xmin: p.x - p.width / 2,
      ymin: p.y - p.height / 2,
      xmax: p.x + p.width / 2,
      ymax: p.y + p.height / 2,
    };
  }

  return {
    label,
    confidence,
    box,
    atSec: typeof p.time === "number" ? p.time : typeof p.timestamp === "number" ? p.timestamp : fallback.atSec,
    frameIndex:
      typeof p.frame_index === "number"
        ? p.frame_index
        : typeof p.frame_id === "number"
          ? p.frame_id
          : fallback.frameIndex,
    trackId: typeof p.tracker_id === "string" ? p.tracker_id : typeof p.track_id === "string" ? p.track_id : undefined,
    classId: typeof p.class_id === "number" ? p.class_id : undefined,
  };
}
