import { env } from "cloudflare:workers";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { handleMonitoringApiRequest, type MonitoringApiAction } from "#/src/lib/monitoring/api";

export { Observer } from "#/src/lib/bindings/observer";
export { Processor } from "#/src/lib/bindings/processor";
export { Server } from "#/src/lib/bindings/server";

export default createServerEntry({
  fetch(request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();

    // Intercept monitoring container API calls before TanStack can fall through
    // to the frontend 404 page. These endpoints are called by the Python
    // container using APP_ORIGIN.
    const monitoringMatch = url.pathname.match(
      /^\/api\/facility\/([^/]+)\/monitoring\/(config|events|frames|segments)$/,
    );
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
