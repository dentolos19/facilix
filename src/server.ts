import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { handleMonitorApiRequest, type MonitorApiAction } from "#/lib/monitoring/api";

export { Monitor } from "#/lib/bindings/monitor";
export { Observer } from "#/lib/bindings/observer";

export default createServerEntry({
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();

    // Intercept monitor container API calls before TanStack can fall through
    // to the frontend 404 page. These endpoints are called by the Python
    // container using APP_ORIGIN.
    const monitorMatch = url.pathname.match(/^\/api\/facility\/([^/]+)\/monitor\/(config|events|frames|segments)$/);
    if (monitorMatch) {
      const [, facilityId, action] = monitorMatch;
      return handleMonitorApiRequest(request, env, facilityId, action as MonitorApiAction);
    }

    // Intercept WebSocket upgrades for the Observer DO
    // path: /api/facility/:id/observer/ws
    if (upgrade === "websocket") {
      const match = url.pathname.match(/^\/api\/facility\/([^/]+)\/observer\/ws$/);
      if (match) {
        const facilityId = match[1];
        const stub = env.OBSERVER.getByName(facilityId);
        return stub.fetch(request);
      }
    }

    return handler.fetch(request);
  },
});
