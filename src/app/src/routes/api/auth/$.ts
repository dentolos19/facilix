import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "#/lib/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = createAuth(env.DATABASE);
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const auth = createAuth(env.DATABASE);
        return auth.handler(request);
      },
    },
  },
});
