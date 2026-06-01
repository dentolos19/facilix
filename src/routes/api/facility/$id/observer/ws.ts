import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

/**
 * WebSocket upgrade endpoint for the Observer DO.
 *
 * The browser connects here and gets a WebSocket that receives
 * real-time facility events (logs, monitor status changes, etc.).
 *
 * The request is proxied to the per-facility Observer Durable Object
 * which handles the WebSocket upgrade and subsequent messaging.
 */
export const Route = createFileRoute("/api/facility/$id/observer/ws")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const stub = env.OBSERVER.getByName(params.id);
        return stub.fetch(request);
      },
    },
  },
});
