/**
 * CCTV simulation helpers.
 *
 * Discovers available streams from the CCTV simulator API and builds
 * browser-compatible HLS playback URLs through the proxy.
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
  label?: string;
  description?: string;
  tags?: string[];
  file?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getApiBase(): string {
  return import.meta.env?.VITE_SIMULATOR_API_URL ?? "http://localhost:3002";
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function fetchSimulationStreams(): Promise<SimulationStream[]> {
  try {
    const res = await fetch(`${getApiBase()}/cctv`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { streams: Record<string, unknown>[] };
    return data.streams.map(toStream);
  } catch {
    return [];
  }
}

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

export function simulationHlsUrl(streamName: string): string {
  return `${getApiBase()}/cctv/${encodeURIComponent(streamName)}/hls/index.m3u8`;
}

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
