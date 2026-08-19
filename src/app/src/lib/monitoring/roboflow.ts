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
  /** Raw Roboflow prediction geometry (center-based coordinates and detection ID). */
  prediction?: {
    x: number;
    y: number;
    width: number;
    height: number;
    detectionId?: string;
  };
  /** Source image dimensions that the prediction coordinates are relative to. */
  image?: {
    width: number;
    height: number;
  };
}

/** Raw Roboflow workflow prediction shape. */
interface RawDetection {
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
  /** Frame sampling interval (default 30 = about 1 FPS for 30 FPS video). */
  frameInterval?: number;
  /** The Durable Object namespace for getting the container stub. */
  serverNamespace: DurableObjectNamespace;
  /** Roboflow API key from the Worker environment, forwarded to the Python container. */
  roboflowApiKey?: string;
  /** Roboflow API base URL from the Worker environment, forwarded to the Python container. */
  roboflowApiBase?: string;
}

/** Video metadata from the Python backend for playback alignment. */
export interface DetectionVideoMeta {
  fps: number;
  frameCount: number;
  decodedFrameCount?: number;
  frameInterval: number;
  attemptedFrameCount?: number;
  sampledFrameCount?: number;
  failedFrameCount?: number;
  skippedFrameCount?: number;
  circuitOpen?: boolean;
  processingDurationMs?: number;
  requestTimeoutSec?: number;
  queueWaitTimeoutSec?: number;
  videoBudgetSec?: number;
  maxConcurrency?: number;
}

/** A sampled frame's detection output. */
export interface DetectionFrame {
  /** Frame index within the video. */
  frameIndex: number;
  /** Timestamp in seconds. */
  atSec: number;
  /** Base64-encoded JPEG of the raw sampled frame. */
  beforeImage: string;
  /** Normalized detections for this frame. */
  detections: WorkflowDetection[];
  /** Source image dimensions that the detections are relative to. */
  image: { width: number; height: number };
}

/** Result of video object detection including metadata. */
export interface VideoDetectionResult {
  detections: WorkflowDetection[];
  detectionOutputs: DetectionFrame[];
  video: DetectionVideoMeta | null;
}

/**
 * Run a specific Roboflow workflow on a video segment via the Python backend.
 *
 * The Python backend (running in a Cloudflare Container) extracts frames using
 * OpenCV and calls the Roboflow REST API for each frame. This avoids the WebRTC
 * requirement that's unavailable in Cloudflare Workers.
 *
 * @returns Detections plus video metadata for playback alignment.
 */
export async function runVideoObjectDetection(options: RunVideoDetectionOptions): Promise<VideoDetectionResult> {
  const {
    segmentBytes,
    pluginWorkflow,
    facilityId,
    minConfidence = 0.4,
    classFilter,
    frameInterval = 30,
    serverNamespace,
    roboflowApiKey,
    roboflowApiBase,
  } = options;

  const containerStub = serverNamespace.getByName(facilityId) as ReturnType<DurableObjectNamespace["getByName"]> & {
    containerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };

  // Build the URL with query parameters
  const params = new URLSearchParams({
    workspace_name: pluginWorkflow.workspaceName,
    workflow_id: pluginWorkflow.workflowId,
    input_name: pluginWorkflow.inputName,
    frame_interval: String(frameInterval),
    min_confidence: String(minConfidence),
  });
  for (const outputName of pluginWorkflow.dataOutputNames ?? []) {
    params.append("data_output_names", outputName);
  }
  for (const label of classFilter ?? []) {
    params.append("class_filter", label);
  }

  const url = `http://localhost:3001/process-video?${params.toString()}`;
  const body = new ArrayBuffer(segmentBytes.byteLength);
  new Uint8Array(body).set(segmentBytes);

  // Frame retries happen inside the container. Replaying the complete video
  // here would repeat successful frame inference and amplify provider load.
  let response: Response;
  try {
    response = await containerStub.containerFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        ...(roboflowApiKey ? { "X-Roboflow-Api-Key": roboflowApiKey } : {}),
        ...(roboflowApiBase ? { "X-Roboflow-Api-Base": roboflowApiBase } : {}),
      },
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Video detection request failed for workflow ${pluginWorkflow.workflowId}: ${message}`, {
      cause: error,
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Python backend error (${response.status}): ${errorText}`);
  }

  const result: unknown = await response.json();
  if (isRecord(result) && typeof result.error === "string") {
    throw new Error(`Python backend error: ${result.error}`);
  }
  let detections = parseWorkflowResponse(result, pluginWorkflow);

  detections = detections.filter((d) => d.confidence >= minConfidence);

  if (classFilter && classFilter.length > 0) {
    const allowedLabels = new Set(classFilter.map((label) => label.toLowerCase()));
    detections = detections.filter((d) => allowedLabels.has(d.label));
  }

  return {
    detections,
    detectionOutputs: extractDetectionOutputs(result),
    video: extractVideoMeta(result),
  };
}

// ── REST response parsing ──────────────────────────────────────────────────

/** Extract video metadata from Python backend response. */
function extractVideoMeta(result: unknown): DetectionVideoMeta | null {
  if (!result || typeof result !== "object") return null;
  const obj = result as Record<string, unknown>;
  const v = obj.video;
  if (!v || typeof v !== "object") return null;
  const video = v as Record<string, unknown>;
  if (
    typeof video.fps !== "number" ||
    typeof video.frameCount !== "number" ||
    typeof video.frameInterval !== "number"
  ) {
    return null;
  }
  return {
    fps: video.fps,
    frameCount: video.frameCount,
    decodedFrameCount: typeof video.decodedFrameCount === "number" ? video.decodedFrameCount : undefined,
    frameInterval: video.frameInterval,
    attemptedFrameCount: typeof video.attemptedFrameCount === "number" ? video.attemptedFrameCount : undefined,
    sampledFrameCount: typeof video.sampledFrameCount === "number" ? video.sampledFrameCount : undefined,
    failedFrameCount: typeof video.failedFrameCount === "number" ? video.failedFrameCount : undefined,
    skippedFrameCount: typeof video.skippedFrameCount === "number" ? video.skippedFrameCount : undefined,
    circuitOpen: typeof video.circuitOpen === "boolean" ? video.circuitOpen : undefined,
    processingDurationMs: typeof video.processingDurationMs === "number" ? video.processingDurationMs : undefined,
    requestTimeoutSec: typeof video.requestTimeoutSec === "number" ? video.requestTimeoutSec : undefined,
    queueWaitTimeoutSec: typeof video.queueWaitTimeoutSec === "number" ? video.queueWaitTimeoutSec : undefined,
    videoBudgetSec: typeof video.videoBudgetSec === "number" ? video.videoBudgetSec : undefined,
    maxConcurrency: typeof video.maxConcurrency === "number" ? video.maxConcurrency : undefined,
  };
}

/** Extract detection outputs from Python backend response. */
function extractDetectionOutputs(result: unknown): DetectionFrame[] {
  if (!result || typeof result !== "object") return [];
  const obj = result as Record<string, unknown>;
  const raw = obj.detectionOutputs;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(isRecord)
    .map((frame) => {
      if (typeof frame.frameIndex !== "number" || typeof frame.atSec !== "number") return null;
      if (typeof frame.beforeImage !== "string") return null;
      if (!Array.isArray(frame.detections)) return null;

      const image =
        isRecord(frame.image) && typeof frame.image.width === "number" && typeof frame.image.height === "number"
          ? { width: frame.image.width, height: frame.image.height }
          : { width: 0, height: 0 };

      const detections = frame.detections
        .filter(isRecord)
        .map((d) => passthroughDetection(d))
        .filter((d): d is WorkflowDetection => d !== null);

      return {
        frameIndex: frame.frameIndex,
        atSec: frame.atSec,
        beforeImage: frame.beforeImage,
        detections,
        image,
      };
    })
    .filter((f): f is DetectionFrame => f !== null);
}

/** Normalise the various shapes the Roboflow REST API may return. */
function parseWorkflowResponse(result: unknown, pluginWorkflow: PluginWorkflowConfig): WorkflowDetection[] {
  if (!result || typeof result !== "object") return [];

  const obj = result as Record<string, unknown>;

  // Python backend returns: { detections: [...], count: N }
  // The Python backend already returns the full normalized format including
  // raw/image fields, so pass them through directly.
  if (Array.isArray(obj.detections)) {
    return obj.detections
      .filter(isRecord)
      .map((d) => passthroughDetection(d))
      .filter((d): d is WorkflowDetection => d !== null);
  }

  // Roboflow REST API shapes (fallback):
  //   { outputs: [ { detections: [...], image: … } ] }
  //   { output:  { detections: [...], image: … }   }
  //   { detections: [...] }                          (single-image shorthand)
  const outputs: Record<string, unknown>[] = Array.isArray(obj.outputs)
    ? (obj.outputs as Record<string, unknown>[])
    : obj.output && typeof obj.output === "object"
      ? [obj.output as Record<string, unknown>]
      : Array.isArray(obj.detections)
        ? [obj as Record<string, unknown>]
        : [obj];

  const dataOutputNames = new Set(pluginWorkflow.dataOutputNames ?? [pluginWorkflow.inputName, "detections", "count"]);
  dataOutputNames.add("detections");
  dataOutputNames.add("predictions");

  const detections: WorkflowDetection[] = [];

  for (const output of outputs) {
    for (const [name, value] of Object.entries(output)) {
      if (name === "count") continue;
      if (!dataOutputNames.has(name)) continue;

      const rawDetections = extractDetections(value);
      // Capture image metadata from the detections output (same structure as Python parser)
      let imageMeta: WorkflowDetection["image"] | undefined;
      if (isRecord(value)) {
        const img = value.image as Record<string, unknown> | undefined;
        if (isRecord(img) && typeof img.width === "number" && typeof img.height === "number") {
          imageMeta = { width: img.width, height: img.height };
        }
      }

      for (const raw of rawDetections) {
        const detection = toDetection(raw, {}, imageMeta);
        if (detection) detections.push(detection);
      }
    }
  }

  return detections;
}

/**
 * Pass-through for detections already normalized by the Python backend.
 * Extracts the common fields and preserves raw/image metadata.
 */
function passthroughDetection(d: Record<string, unknown>): WorkflowDetection | null {
  if (typeof d.confidence !== "number") return null;
  return {
    label: String(d.label ?? "unknown"),
    confidence: d.confidence,
    box: d.box as WorkflowDetection["box"] | undefined,
    atSec: typeof d.atSec === "number" ? d.atSec : undefined,
    frameIndex: typeof d.frameIndex === "number" ? d.frameIndex : undefined,
    trackId: typeof d.trackId === "string" ? d.trackId : undefined,
    classId: typeof d.classId === "number" ? d.classId : undefined,
    prediction: (d.prediction ?? d.detection) as WorkflowDetection["prediction"] | undefined,
    image: d.image as WorkflowDetection["image"] | undefined,
  };
}

function extractDetections(value: unknown): RawDetection[] {
  if (Array.isArray(value)) return value.filter(isRecord) as RawDetection[];
  if (!isRecord(value)) return [];

  if (Array.isArray(value.value)) return value.value.filter(isRecord) as RawDetection[];
  if (isRecord(value.value)) return extractDetections(value.value);

  if (Array.isArray(value.detections)) return value.detections.filter(isRecord) as RawDetection[];
  if (isRecord(value.detections)) return extractDetections(value.detections);

  if (Array.isArray(value.predictions)) return value.predictions.filter(isRecord) as RawDetection[];
  if (isRecord(value.predictions)) return extractDetections(value.predictions);

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** Normalize a raw Roboflow workflow prediction into our shared detection shape. */
function toDetection(
  p: RawDetection,
  fallback: { frameIndex?: number; atSec?: number },
  imageMeta?: WorkflowDetection["image"],
): WorkflowDetection | null {
  if (typeof p.confidence !== "number") return null;

  const label = String(p.class ?? "unknown").toLowerCase();
  const confidence = p.confidence;

  let box: WorkflowDetection["box"] | undefined;
  let rawLocal: WorkflowDetection["prediction"] | undefined;
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
    rawLocal = {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      detectionId: typeof p.detection_id === "string" ? p.detection_id : undefined,
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
    prediction: rawLocal,
    image: imageMeta,
  };
}
