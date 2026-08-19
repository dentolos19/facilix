import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { createLogger } from "#/lib/logs";

const log = createLogger("openrouter");

/**
 * Cloudflare Workers-compatible OpenRouter client used for image and
 * video scene understanding in the CCTV monitoring pipeline.
 *
 * - Uses the OpenAI-compatible `/api/v1/chat/completions` endpoint.
 * - Sends base64 data URLs so we can hand it raw bytes from R2 without
 *   having to publish the objects publicly.
 * - Image and video inputs are dispatched the same way; only the
 *   `data:` MIME prefix and content-part type change.
 *
 * @see https://openrouter.ai/docs/api/reference/overview
 * @see https://openrouter.ai/docs/guides/overview/multimodal/image-understanding
 * @see https://openrouter.ai/docs/guides/overview/multimodal/videos
 */

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_TIMEOUT_MS = 45_000;

/** Model id to request. Uses OpenRouter's automatic routing when none is configured. */
function resolveModel(): string {
  const m = env.OPENROUTER_MODEL;
  return m && m.length > 0 ? m : "openrouter/auto";
}

function baseUrl(): string {
  return DEFAULT_BASE_URL;
}

function requireApiKey(): string {
  const key = env.OPENROUTER_API_KEY;
  if (!key || key.length === 0) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. Set it as a Cloudflare secret (wrangler secret put OPENROUTER_API_KEY).",
    );
  }
  return key;
}

/** TanStack AI adapter configured with the same OpenRouter model and credentials. */
export function createChatAdapter() {
  const model = resolveModel() as Parameters<typeof createOpenRouterText>[0];
  const config: Record<string, string> = {};
  if (env.OPENROUTER_REFERER) config.httpReferer = env.OPENROUTER_REFERER;
  if (env.OPENROUTER_TITLE) config.appTitle = env.OPENROUTER_TITLE;
  return createOpenRouterText(model, requireApiKey(), config);
}

function attributionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.OPENROUTER_REFERER) headers["HTTP-Referer"] = env.OPENROUTER_REFERER;
  if (env.OPENROUTER_TITLE) headers["X-OpenRouter-Title"] = env.OPENROUTER_TITLE;
  return headers;
}

/** The minimal content-part shapes we send to OpenRouter. */
type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };
type VideoPart = { type: "video_url"; video_url: { url: string } };
type ContentPart = TextPart | ImagePart | VideoPart;

type ChatMessage = {
  role: "user" | "system" | "assistant";
  content: string | ContentPart[];
};

type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: "json_object" };
  stream?: false;
};

type ChatChoice = {
  finish_reason?: string | null;
  message?: { role?: string; content?: string | null };
};

type ChatResponse = {
  choices?: ChatChoice[];
  error?: { message?: string; code?: number };
};

const FacilityLayoutOutputSchema = z.object({
  facilityName: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["Zone", "CCTV", "Sensor", "Signal"]),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      zoneId: z.string().nullable(),
      name: z.string(),
      status: z.string(),
      notes: z.string(),
      props: z.object({}).passthrough(),
    }),
  ),
});

/** Convert raw bytes to a `data:<mime>;base64,...` URL. */
function bytesToDataUrl(bytes: Uint8Array | ArrayBuffer, mime: string): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function resolveProvider(model: string): { only: string[]; allow_fallbacks: false } | undefined {
  return model.startsWith("qwen/") ? { only: ["alibaba"], allow_fallbacks: false } : undefined;
}

/** Internal: call OpenRouter and pull the assistant text out. */
async function chatCompletion(parts: ContentPart[], options: { maxTokens?: number }): Promise<string | null> {
  const model = resolveModel();
  const request: ChatRequest & { provider?: { only: string[]; allow_fallbacks: false } } = {
    model,
    messages: [{ role: "user", content: parts }],
    max_tokens: options.maxTokens ?? 200,
    temperature: 0.2,
    stream: false,
  };
  const provider = resolveProvider(model);
  if (provider) request.provider = provider;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireApiKey()}`,
        "Content-Type": "application/json",
        ...attributionHeaders(),
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`OpenRouter request failed after ${Date.now() - startedAt}ms`, { cause: error });
  }

  if (!response.ok) {
    const tail = (await response.text()).slice(0, 500);
    log.error(`OpenRouter HTTP ${response.status}`, { model: request.model, status: response.status, response: tail });
    throw new Error(`OpenRouter HTTP ${response.status}: ${tail}`);
  }

  const payload = (await response.json()) as ChatResponse;
  if (payload.error?.message) {
    log.error(`OpenRouter API error: ${payload.error.message}`, { code: payload.error.code, model: request.model });
    throw new Error(`OpenRouter error ${payload.error.code ?? "?"}: ${payload.error.message}`);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  log.info("OpenRouter completion ok", {
    model: request.model,
    outputLength: trimmed.length,
    durationMs: Date.now() - startedAt,
  });
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Describe a video clip (e.g. a CCTV segment) using the configured
 * OpenRouter multimodal model. Returns `null` if the model produced no
 * usable text. The model must support video input; if it doesn't,
 * OpenRouter will return an error which we surface as a thrown error
 * so the workflow step retries (or the caller can fall back).
 */
export async function summarizeVideo(
  videoBytes: Uint8Array | ArrayBuffer,
  mimeType = "video/mp4",
  prompt: string,
  options: { maxTokens?: number } = {},
): Promise<string | null> {
  const url = bytesToDataUrl(videoBytes, mimeType);
  return chatCompletion(
    [
      { type: "text", text: prompt },
      { type: "video_url", video_url: { url } },
    ],
    options,
  );
}

/** Ask the configured multimodal model a question about a facility image. */
export async function summarizeImage(
  imageBytes: Uint8Array | ArrayBuffer,
  mimeType = "image/jpeg",
  prompt: string,
  options: { maxTokens?: number } = {},
): Promise<string | null> {
  const url = bytesToDataUrl(imageBytes, mimeType);
  return chatCompletion(
    [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url } },
    ],
    options,
  );
}

/**
 * Convert a floor plan, site plan, sketch, or facility photo into the JSON
 * consumed by the facility canvas. The caller validates and normalizes the
 * model response before it reaches editor state.
 */
export async function generateFacilityLayoutFromImage(
  imageBytes: Uint8Array | ArrayBuffer,
  mimeType: string,
  target: { width: number; height: number },
): Promise<z.infer<typeof FacilityLayoutOutputSchema>> {
  const prompt = `Analyze this facility image and build a practical 2D facility layout for a ${target.width} by ${target.height} pixel canvas.

Identify labeled or visually distinct rooms and operational areas as Zone rectangles. Add CCTV, Sensor, or Signal items only when the image clearly shows or labels those devices.

Return ONLY valid JSON with this exact top-level shape:
{
  "facilityName": "Name inferred from the image, or Imported facility",
  "items": [
    {
      "id": "zone-1",
      "type": "Zone",
      "x": 20,
      "y": 20,
      "width": 300,
      "height": 180,
      "zoneId": null,
      "name": "Loading Bay",
      "status": "—",
      "notes": "Optional short explanation",
      "props": { "iconColor": "#3b82f6", "zoneType": "loading-bay" }
    },
    {
      "id": "camera-1",
      "type": "CCTV",
      "x": 80,
      "y": 70,
      "width": 36,
      "height": 36,
      "zoneId": "zone-1",
      "name": "Loading Bay Camera",
      "status": "unknown",
      "notes": "",
      "props": {}
    }
  ]
}

Rules:
- type must be exactly Zone, CCTV, Sensor, or Signal.
- For every Zone, set props.zoneType to one of these values based on visible labels or room purpose: "generic", "office", "car-park", "factory-floor", "warehouse", "loading-bay", "storage", "lobby", "meeting-room", "break-room", "server-room", "laboratory". Default to "generic" if purpose is unclear.
- Keep every item within the target canvas.
- Use the image's relative geometry and adjacency; do not stack zones on top of each other unless the image does.
- Use unique string IDs. Set each device's zoneId to the containing Zone ID when applicable.
- Prefer a useful simplified layout over invented detail.
  - Do not include markdown or commentary.`;

  const url = bytesToDataUrl(imageBytes, mimeType);
  return chat({
    adapter: createChatAdapter(),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", content: prompt },
          { type: "image", source: { type: "url", value: url } },
        ],
      },
    ],
    modelOptions: {
      maxCompletionTokens: 5000,
      temperature: 0.2,
    },
    outputSchema: FacilityLayoutOutputSchema,
  });
}

// ─── Scene alert analysis ────────────────────────────────────────────────

/** Evidence of a scene match, with optional bounding box. */
export interface SceneEvidence {
  label: string;
  confidence: number;
  box?: { xmin: number; ymin: number; xmax: number; ymax: number };
}

/** Result of evaluating a single scene alert description. */
export interface SceneAlertMatch {
  description: string;
  matched: boolean;
  confidence?: number;
  evidence?: SceneEvidence[];
}

/** Full result of scene alert analysis. */
export interface SceneAlertAnalysis {
  summary: string;
  matches: SceneAlertMatch[];
}

export interface SceneFrameImage {
  bytes: Uint8Array | ArrayBuffer;
  mimeType?: string;
}

/**
 * Analyze a CCTV frame against multiple natural-language scene alert
 * descriptions. Returns structured JSON indicating which descriptions
 * match the scene, with confidence scores.
 */
export async function analyzeSceneFrames(
  image: SceneFrameImage,
  descriptions: string[],
  guidance?: string,
  contextSuffix?: string,
): Promise<SceneAlertAnalysis | null> {
  if (descriptions.length === 0) return null;

  const descriptionList = descriptions.map((description, index) => `${index + 1}. "${description}"`).join("\n");
  const systemPrompt = `You are a CCTV scene analysis assistant. Review a CCTV frame for visible operational conditions.

For each description, determine whether the visible scene matches it, give a confidence score from 0 to 1, and cite visible evidence.

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief overall scene description",
  "matches": [
    {
      "description": "<the description being evaluated>",
      "matched": true,
      "confidence": 0.0,
      "evidence": [
        { "label": "visible evidence", "confidence": 0.0 }
      ]
    }
  ]
}`;
  const userPrompt = `${guidance ? `${guidance}\n\n` : ""}Evaluate these operational conditions:

${descriptionList}${contextSuffix ?? ""}`;
  const imageUrl = bytesToDataUrl(image.bytes, image.mimeType ?? "image/jpeg");

  const result = await chatCompletionWithJson(
    [
      { type: "text", text: systemPrompt },
      { type: "text", text: userPrompt },
      { type: "image_url", image_url: { url: imageUrl } },
    ],
    { maxTokens: 1500 },
  );

  return parseSceneAlertAnalysis(result);
}

export async function summarizeSceneFrames(
  image: SceneFrameImage,
  prompt: string,
  options: { maxTokens?: number } = {},
): Promise<string | null> {
  return chatCompletion(
    [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: { url: bytesToDataUrl(image.bytes, image.mimeType ?? "image/jpeg") },
      },
    ],
    options,
  );
}

/**
 * Analyze a video clip against multiple natural-language scene alert
 * descriptions. Returns structured JSON indicating which descriptions
 * match the scene, with confidence scores and optional bounding-box evidence.
 *
 * @param videoBytes - The video segment bytes.
 * @param mimeType - MIME type of the video (default "video/mp4").
 * @param descriptions - Array of natural-language descriptions to check.
 * @param contextSuffix - Optional extra context appended to the prompt (e.g. detection counts).
 * @param guidance - Optional plugin-specific instructions for analyzing the video.
 * @returns Structured analysis with per-description match results, or null on failure.
 */
export async function analyzeSceneAlerts(
  videoBytes: Uint8Array | ArrayBuffer,
  mimeType: string,
  descriptions: string[],
  contextSuffix: string = "",
  guidance?: string,
): Promise<SceneAlertAnalysis | null> {
  if (descriptions.length === 0) return null;

  const descriptionList = descriptions.map((d, i) => `${i + 1}. "${d}"`).join("\n");

  const systemPrompt = `You are a CCTV scene analysis assistant. Analyze the video and evaluate whether each described scenario is present.

For each description, determine:
- Whether the scene MATCHES the description (true/false)
- A confidence score (0-1)
- Evidence: list any objects/people/activities that support or contradict the match, with bounding box coordinates if visible

Respond ONLY with valid JSON in this exact format:
{
  "summary": "Brief overall scene description",
  "matches": [
    {
      "description": "<the description being evaluated>",
      "matched": true/false,
      "confidence": 0.0-1.0,
      "evidence": [
        { "label": "object label", "confidence": 0.0-1.0, "box": { "xmin": N, "ymin": N, "xmax": N, "ymax": N } }
      ]
    }
  ]
}

Rules:
- Evaluate each description independently
- bounding boxes should be in pixel coordinates relative to the video frame
- confidence should reflect how certain you are about the match
- evidence should list specific visual elements that support your judgment`;

  const userPrompt = `${guidance ? `${guidance}\n\n` : ""}Evaluate the following scenarios against this CCTV video:

${descriptionList}${contextSuffix}`;

  const url = bytesToDataUrl(videoBytes, mimeType);

  const result = await chatCompletionWithJson(
    [
      { type: "text", text: systemPrompt },
      { type: "text", text: userPrompt },
      { type: "video_url", video_url: { url } },
    ],
    { maxTokens: 1500 },
  );

  return parseSceneAlertAnalysis(result);
}

function parseSceneAlertAnalysis(result: string | null): SceneAlertAnalysis | null {
  if (!result) return null;
  try {
    const parsed = JSON.parse(result) as SceneAlertAnalysis;
    if (typeof parsed.summary !== "string" || !Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
    log.error("Failed to parse scene alert JSON", { response: result.slice(0, 500) });
    return null;
  }
}

function parseJsonObject(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? value : null;
  } catch {
    return null;
  }
}

function findJsonObjectEnd(value: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

/** Extract the first valid JSON object, even when a model adds surrounding prose. */
function extractJsonObject(value: string): string | null {
  const direct = parseJsonObject(value);
  if (direct) return direct;

  for (let start = value.indexOf("{"); start >= 0; start = value.indexOf("{", start + 1)) {
    const end = findJsonObjectEnd(value, start);
    if (end < 0) return null;

    const extracted = parseJsonObject(value.slice(start, end + 1));
    if (extracted) return extracted;
  }

  return null;
}

/** Internal: call OpenRouter expecting a JSON object. */
async function chatCompletionWithJson(parts: ContentPart[], options: { maxTokens?: number }): Promise<string | null> {
  const model = resolveModel();
  const request: ChatRequest & { provider?: { only: string[]; allow_fallbacks: false } } = {
    model,
    messages: [{ role: "user", content: parts }],
    max_tokens: options.maxTokens ?? 200,
    temperature: 0.2,
    response_format: { type: "json_object" },
    stream: false,
  };
  const provider = resolveProvider(model);
  if (provider) request.provider = provider;

  const startedAt = Date.now();
  const signal = AbortSignal.timeout(OPENROUTER_TIMEOUT_MS);
  const sendRequest = async () => {
    try {
      return await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireApiKey()}`,
          "Content-Type": "application/json",
          ...attributionHeaders(),
        },
        body: JSON.stringify(request),
        signal,
      });
    } catch (error) {
      throw new Error(`OpenRouter JSON request failed after ${Date.now() - startedAt}ms`, { cause: error });
    }
  };

  let response = await sendRequest();
  if (!response.ok && response.status === 400) {
    const tail = (await response.text()).slice(0, 500);
    log.warn("OpenRouter rejected JSON mode; retrying without it", { model: request.model, response: tail });
    delete request.response_format;
    response = await sendRequest();
  }

  if (!response.ok) {
    const tail = (await response.text()).slice(0, 500);
    log.error(`OpenRouter HTTP ${response.status}`, { model: request.model, status: response.status, response: tail });
    throw new Error(`OpenRouter HTTP ${response.status}: ${tail}`);
  }

  const payload = (await response.json()) as ChatResponse;
  if (payload.error?.message) {
    log.error(`OpenRouter API error: ${payload.error.message}`, { code: payload.error.code, model: request.model });
    throw new Error(`OpenRouter error ${payload.error.code ?? "?"}: ${payload.error.message}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    log.warn("OpenRouter JSON completion had no text content", {
      model: request.model,
      finishReason: payload.choices?.[0]?.finish_reason,
    });
    return null;
  }

  const trimmed = content.trim();

  const extracted = extractJsonObject(trimmed);
  if (extracted) {
    log.info("OpenRouter JSON completion ok", {
      model: request.model,
      outputLength: extracted.length,
      durationMs: Date.now() - startedAt,
    });
    return extracted;
  }

  log.warn("OpenRouter response did not contain a valid JSON object", {
    model: request.model,
    finishReason: payload.choices?.[0]?.finish_reason,
    response: trimmed.slice(0, 300),
  });
  return null;
}

/**
 * Default facade kept for backwards compatibility with existing callers
 * that previously used the `createAI()` shape from the TanStack
 * `openRouterText` adapter. The adapter itself is no longer used in
 * the monitoring path, but the function signature is preserved so
 * other code that imports `createAI` keeps working.
 */
export function createAI() {
  return {
    summarizeVideo,
    analyzeSceneAlerts,
    analyzeSceneFrames,
    summarizeSceneFrames,
  };
}
