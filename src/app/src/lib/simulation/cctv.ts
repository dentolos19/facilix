/**
 * CCTV simulation helpers.
 *
 * Discovers available streams from the CCTV simulator API and builds
 * browser-compatible HLS playback URLs through MediaMTX.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulationStream {
  name: string;
  alive: boolean;
  rtspUrl: string;
  rtmpUrl: string;
  hlsUrl: string;
  videoPath: string;
  /** Optional metadata from the video manifest. */
  label?: string;
  description?: string;
  tags?: string[];
  file?: string;
}

export interface SimulationStreamsResponse {
  streams: SimulationStream[];
}

// ---------------------------------------------------------------------------
// Configuration (Vite client env vars – local dev only)
// ---------------------------------------------------------------------------

function getApiBase(): string {
  return import.meta.env?.VITE_CCTV_SIMULATOR_API_URL ?? "http://localhost:3002";
}

function getHlsBase(): string {
  return import.meta.env?.VITE_CCTV_HLS_BASE_URL ?? "http://localhost:3005";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the list of available simulation streams from the CCTV simulator.
 * Returns an empty array if the simulator is unreachable.
 */
export async function fetchSimulationStreams(): Promise<SimulationStream[]> {
  try {
    const res = await fetch(`${getApiBase()}/streams`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as SimulationStreamsResponse;
    return data.streams.map(toStream);
  } catch {
    return [];
  }
}

/**
 * Fetch health status of the simulator (CCTV + sensors).
 */
export async function fetchSimulationHealth(): Promise<{
  ok: boolean;
  alive: number;
  total: number;
}> {
  try {
    const res = await fetch(`${getApiBase()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, alive: 0, total: 0 };
    const data = (await res.json()) as {
      status: string;
      cctv: { alive: number; total: number };
    };
    return {
      ok: data.status === "ok",
      alive: data.cctv.alive,
      total: data.cctv.total,
    };
  } catch {
    return { ok: false, alive: 0, total: 0 };
  }
}

// ---------------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------------

/**
 * Build an HLS playback URL for a given simulation stream name.
 */
export function simulationHlsUrl(streamName: string): string {
  return `${getHlsBase()}/${encodeURIComponent(streamName)}/index.m3u8`;
}

/**
 * Static fallback stream names when the simulator is unreachable.
 * Metadata matches the samples/videos.json manifest.
 */
export const FALLBACK_SIMULATION_STREAMS: SimulationStream[] = [
  {
    name: "b0",
    alive: false,
    rtspUrl: "rtsp://localhost:3003/b0",
    rtmpUrl: "rtmp://localhost:3004/b0",
    hlsUrl: simulationHlsUrl("b0"),
    videoPath: "samples/b0.mp4",
    label: "Sample CCTV b0",
    description: "Demo CCTV sample video for testing (b0)",
    tags: ["demo", "cctv", "indoor"],
    file: "b0.mp4",
  },
  {
    name: "g0",
    alive: false,
    rtspUrl: "rtsp://localhost:3003/g0",
    rtmpUrl: "rtmp://localhost:3004/g0",
    hlsUrl: simulationHlsUrl("g0"),
    videoPath: "samples/g0.mp4",
    label: "Sample CCTV g0",
    description: "Demo CCTV sample video for testing (g0)",
    tags: ["demo", "cctv", "indoor"],
    file: "g0.mp4",
  },
];

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function toStream(raw: Record<string, unknown>): SimulationStream {
  const name = String(raw.name ?? "");
  return {
    name,
    alive: Boolean(raw.alive),
    rtspUrl: String(raw.rtsp_url ?? ""),
    rtmpUrl: String(raw.rtmp_url ?? ""),
    hlsUrl: simulationHlsUrl(name),
    videoPath: String(raw.video_path ?? ""),
    label: raw.label ? String(raw.label) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    file: raw.file ? String(raw.file) : undefined,
  };
}
