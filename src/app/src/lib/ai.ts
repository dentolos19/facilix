import { env } from "cloudflare:workers";
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

/** Model id to request. Falls back to `OPENROUTER_MODEL` then to Qwen3.6 35B A3B. */
function resolveModel(): string {
  const m = env.OPENROUTER_MODEL;
  return m && m.length > 0 ? m : "qwen/qwen3.6-35b-a3b";
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

/** Internal: call OpenRouter and pull the assistant text out. */
async function chatCompletion(parts: ContentPart[], options: { maxTokens?: number }): Promise<string | null> {
  const request: ChatRequest = {
    model: resolveModel(),
    messages: [{ role: "user", content: parts }],
    max_tokens: options.maxTokens ?? 200,
    temperature: 0.2,
    stream: false,
  };

  const response = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      "Content-Type": "application/json",
      ...attributionHeaders(),
    },
    body: JSON.stringify(request),
  });

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
  log.info("OpenRouter completion ok", { model: request.model, outputLength: trimmed.length });
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Describe an image (e.g. a single CCTV frame) using the configured
 * OpenRouter vision model. Returns `null` if the model produced no
 * usable text so callers can fall back gracefully.
 */
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

/**
 * Default facade kept for backwards compatibility with existing callers
 * that previously used the `createAI()` shape from the TanStack
 * `openRouterText` adapter. The adapter itself is no longer used in
 * the monitoring path, but the function signature is preserved so
 * other code that imports `createAI` keeps working.
 */
export function createAI() {
  return {
    summarizeImage,
    summarizeVideo,
  };
}
