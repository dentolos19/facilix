import { createFileRoute } from "@tanstack/react-router";
import { createAuth } from "#/lib/auth/server";

/**
 * Catch-all API route for Better Auth.
 *
 * All requests to `/api/auth/*` are forwarded to Better Auth's handler
 * which takes care of routing, CORS, and cookie management internally.
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const auth = createAuth(context.cloudflare.env.DB);
        return auth.handler(request);
      },
      POST: async ({ request, context }) => {
        const auth = createAuth(context.cloudflare.env.DB);
        return auth.handler(request);
      },
    },
  },
});
