import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDatabase } from "#/lib/database";
import { recordFacilityEvent, validateDevice } from "#/lib/monitoring/utils";

/**
 * POST /api/facility/:id/monitor/events
 *
 * Called by the Python monitor container to push events (heartbeats,
 * sensor alerts, stream failures, etc.).
 *
 * Body: { deviceId: string, type: string, severity: "info"|"warn"|"error", message: string, data?: object }
 */
export const Route = createFileRoute("/api/facility/$id/monitor/events")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const auth = request.headers.get("authorization");
        const expected = env.MONITOR_INGEST_TOKEN;
        if (!expected || auth !== `Bearer ${expected}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: {
          deviceId?: string;
          type?: string;
          severity?: string;
          message?: string;
          data?: Record<string, unknown>;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (!body.deviceId || !body.type || !body.severity || !body.message) {
          return Response.json(
            { error: "Missing required fields: deviceId, type, severity, message" },
            { status: 400 },
          );
        }

        if (!["info", "warn", "error"].includes(body.severity)) {
          return Response.json({ error: "severity must be info, warn, or error" }, { status: 400 });
        }

        const db = createDatabase(env.DATABASE);

        const device = await validateDevice(db, params.id, body.deviceId);
        if (!device) {
          return Response.json({ error: "Device not found for this facility" }, { status: 404 });
        }

        const eventId = await recordFacilityEvent(
          db,
          env.OBSERVER.getByName(params.id),
          params.id,
          body.deviceId,
          body.type,
          body.severity as "info" | "warn" | "error",
          body.message,
          { ...body.data, source: "monitor-container" },
        );

        if (!eventId) {
          return Response.json({ error: "Failed to record event" }, { status: 500 });
        }

        return Response.json({ success: true, eventId });
      },
    },
  },
});
