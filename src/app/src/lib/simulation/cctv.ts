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
  status: "stopped" | "starting" | "running" | "error";
  hlsReady: boolean;
  hlsError: string | null;
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
  running: number;
  hlsReady: number;
  requested: number;
  total: number;
}> {
  try {
    const res = await fetch(`${getApiBase()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, running: 0, hlsReady: 0, requested: 0, total: 0 };
    const data = (await res.json()) as {
      status: string;
      cctv: { running: number; hlsReady: number; requested: number; total: number };
    };
    return {
      ok: data.status === "ok",
      running: data.cctv.running,
      hlsReady: data.cctv.hlsReady,
      requested: data.cctv.requested,
      total: data.cctv.total,
    };
  } catch {
    return { ok: false, running: 0, hlsReady: 0, requested: 0, total: 0 };
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
    status: (() => {
      const status = String(raw.status ?? "error");
      return status === "stopped" || status === "starting" || status === "running" ? status : "error";
    })(),
    hlsReady: Boolean(raw.hls_ready),
    hlsError: raw.hls_error ? String(raw.hls_error) : null,
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
