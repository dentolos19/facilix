import { env } from "cloudflare:workers";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { handleMonitoringApiRequest, type MonitoringApiAction } from "#/lib/monitoring/api";

export { Observer } from "#/lib/bindings/observer";
export { Processor } from "#/lib/bindings/processor";
export { Server } from "#/lib/bindings/server";

/**
 * Parse an HTTP Range header of the form `bytes=start-end`.
 * Returns null if the header is missing or invalid.
 */
function parseRangeHeader(range: string | null, totalSize: number): { offset: number; length: number } | null {
  if (!range || !range.startsWith("bytes=")) return null;
  const spec = range.slice(6).split(",")[0]?.trim();
  if (!spec) return null;
  const [startStr, endStr] = spec.split("-");
  if (!startStr) return null;

  const start = Number.parseInt(startStr, 10);
  if (Number.isNaN(start) || start < 0 || start >= totalSize) return null;

  const end = endStr ? Number.parseInt(endStr, 10) : totalSize - 1;
  if (Number.isNaN(end) || end < start || end >= totalSize) return null;

  return { offset: start, length: end - start + 1 };
}

/**
 * Serve a stored R2 asset by id. Supports HTTP range requests so
 * `<video>` elements can seek efficiently. Used by the playback tab
 * to stream recorded CCTV segments.
 */
async function serveAsset(request: Request, assetId: string): Promise<Response> {
  const head = await env.BUCKET.head(assetId);
  if (!head) {
    return new Response("Asset not found", { status: 404 });
  }

  const range = parseRangeHeader(request.headers.get("range"), head.size);
  const object = await env.BUCKET.get(assetId, range ? { range } : undefined);
  if (!object) {
    return new Response("Asset not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");

  if (object.range) {
    const { offset, length } = object.range;
    headers.set("content-length", String(length));
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();

    // Serve stored R2 assets (recorded segments / frames).
    const assetMatch = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (assetMatch) {
      const [, assetId] = assetMatch;
      return serveAsset(request, assetId);
    }

    // Intercept monitoring container API calls before TanStack can fall through
    // to the frontend 404 page. These endpoints are called by the Python
    // container using APP_ORIGIN.
    const monitoringMatch = url.pathname.match(/^\/api\/facility\/([^/]+)\/monitoring\/(config|events|segments)$/);
    if (monitoringMatch) {
      const [, facilityId, action] = monitoringMatch;
      return handleMonitoringApiRequest(request, env, facilityId, action as MonitoringApiAction);
    }

    // Intercept Observer DO requests (WebSocket upgrades + plain GET)
    // path: /api/facility/:id/observer/ws
    const observerMatch = url.pathname.match(/^\/api\/facility\/([^/]+)\/observer\/ws$/);
    if (observerMatch) {
      const [, facilityId] = observerMatch;
      const stub = env.OBSERVER.getByName(facilityId);
      return stub.fetch(request);
    }

    return handler.fetch(request);
  },
});
