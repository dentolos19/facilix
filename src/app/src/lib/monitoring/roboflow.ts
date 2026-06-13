/**
 * Roboflow hosted-inference helpers.
 *
 * Wraps the Serverless Hosted API
 *   POST {API_BASE}/{dataset_id}/{version_id}?api_key=...
 *   body: { base64 image } (we use `image_type=base64` to send the raw bytes)
 *
 * The Roboflow response shape for object-detection models is:
 *   { image: { width, height }, predictions: ObjectDetectionPrediction[] }
 * where each prediction has `x`, `y`, `width`, `height` (center-xy box in
 * pixels), `confidence`, `class`, and `class_id`. We normalise this into
 * the shared `Detection` type used by the monitoring pipeline.
 *
 * @see https://docs.roboflow.com/deploy/serverless-hosted-api-v2/use-with-the-rest-api
 */

import { env } from "cloudflare:workers";
import { type Detection, type DetectionBox, MIN_CONFIDENCE } from "./detection";

/** A raw Roboflow object-detection prediction. */
type RoboflowPrediction = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  class_id?: number;
  class_confidence?: number | null;
  detection_id?: string;
  // Optional Roboflow response metadata we ignore.
  [key: string]: unknown;
};

/** A trimmed Roboflow object-detection response. */
type RoboflowResponse = {
  image?: { width: number; height: number };
  predictions: RoboflowPrediction[];
};

export type RoboflowModelSpec = {
  /** Project slug, e.g. `cctv-naxyo`. */
  project: string;
  /** Model version, e.g. `1`. */
  version: string;
};

const DEFAULT_API_BASE = "https://serverless.roboflow.com";

/** Parse a `"project/version"` style model id. */
function parseModelId(modelId: string | undefined): RoboflowModelSpec | null {
  if (!modelId) return null;
  const [project, version] = modelId.split("/");
  if (!project || !version) return null;
  return { project, version };
}

/** Cast any env-overridable string to a number with a default. */
function envFloat(name: string, fallback: number): number {
  const raw = (env as Record<string, string | undefined>)[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function apiBase(): string {
  const raw = (env as Record<string, string | undefined>).ROBOFLOW_API_BASE;
  return (raw && raw.length > 0 ? raw : DEFAULT_API_BASE).replace(/\/$/, "");
}

/** Get configured model ids from env, skipping entries that are unset. */
export function getRoboflowModels(): RoboflowModelSpec[] {
  const people = parseModelId((env as Record<string, string | undefined>).ROBOFLOW_PEOPLE_MODEL_ID);
  const ppe = parseModelId((env as Record<string, string | undefined>).ROBOFLOW_PPE_MODEL_ID);
  return [people, ppe].filter((m): m is RoboflowModelSpec => m !== null);
}

function apiKey(): string | null {
  const key = (env as Record<string, string | undefined>).ROBOFLOW_API_KEY;
  return key && key.length > 0 ? key : null;
}

/** Throw a helpful error if the Roboflow key is missing. */
function requireApiKey(): string {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "ROBOFLOW_API_KEY is not configured. Set it as a Cloudflare secret (wrangler secret put ROBOFLOW_API_KEY).",
    );
  }
  return key;
}

/** Normalise one Roboflow prediction into our shared Detection shape. */
function toDetection(modelId: string, p: RoboflowPrediction, minConf: number): Detection | null {
  if (typeof p.confidence !== "number" || p.confidence < minConf) return null;

  const xmin = p.x - p.width / 2;
  const ymin = p.y - p.height / 2;
  const xmax = p.x + p.width / 2;
  const ymax = p.y + p.height / 2;

  const box: DetectionBox = { xmin, ymin, xmax, ymax };
  return {
    label: String(p.class ?? "unknown").toLowerCase(),
    confidence: p.confidence,
    box,
    modelId,
    classId: typeof p.class_id === "number" ? p.class_id : undefined,
  };
}

/** Run a single Roboflow model. Throws on non-2xx so workflow `step.do` retries. */
async function runSingleModel(
  model: RoboflowModelSpec,
  frameBytes: ArrayBuffer | Uint8Array,
  options: { confidence: number },
): Promise<Detection[]> {
  const key = requireApiKey();
  const url = `${apiBase()}/${encodeURIComponent(model.project)}/${encodeURIComponent(model.version)}`;

  // Normalise the body to a base64 string. Roboflow accepts a JSON body
  // with the base64 image as the `image` field when `image_type=base64`.
  const bytes = frameBytes instanceof Uint8Array ? frameBytes : new Uint8Array(frameBytes);

  // Use a chunked base64 conversion so very large images don't blow the
  // call stack in the runtime.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);

  const params = new URLSearchParams({
    api_key: key,
    confidence: String(options.confidence),
    format: "json",
    image_type: "base64",
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: base64,
  });

  if (!response.ok) {
    const tail = (await response.text()).slice(0, 500);
    throw new Error(`Roboflow ${model.project}/${model.version} HTTP ${response.status}: ${tail}`);
  }

  const payload = (await response.json()) as RoboflowResponse | { detail?: unknown };
  if (!("predictions" in payload) || !Array.isArray(payload.predictions)) {
    return [];
  }
  const minConf = options.confidence;
  return payload.predictions
    .map((p) => toDetection(`${model.project}/${model.version}`, p, minConf))
    .filter((d): d is Detection => d !== null);
}

/**
 * Run all configured Roboflow models in parallel and merge their
 * detections into a single flat array.
 *
 * Models that fail are surfaced as a single error after all attempts
 * complete, so transient failures from one model don't lose detections
 * from another.
 */
export async function detectObjects(frameBytes: ArrayBuffer | Uint8Array): Promise<Detection[]> {
  const models = getRoboflowModels();
  if (models.length === 0) {
    return [];
  }

  const minConf = envFloat("ROBOFLOW_CONFIDENCE", MIN_CONFIDENCE);
  const results = await Promise.allSettled(models.map((m) => runSingleModel(m, frameBytes, { confidence: minConf })));

  const errors: string[] = [];
  const merged: Detection[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      merged.push(...r.value);
    } else {
      const name = `${models[i].project}/${models[i].version}`;
      errors.push(`${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  // If every model failed, throw so the workflow retries the step.
  if (merged.length === 0 && errors.length === models.length) {
    throw new Error(`All Roboflow models failed: ${errors.join(" | ")}`);
  }

  return merged;
}
