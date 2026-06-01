import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export { Monitor } from "#/lib/bindings/monitor";
export { Observer } from "#/lib/bindings/observer";

export default createServerEntry({
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();

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
