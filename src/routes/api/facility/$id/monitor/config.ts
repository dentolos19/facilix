import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { createDatabase } from "#/lib/database";
import * as schema from "#/lib/database/schema";

/**
 * GET /api/facility/:id/monitor/config
 *
 * Returns the monitoring configuration for the container, including
 * all CCTV and sensor devices, their stream URLs, and polling intervals.
 *
 * Called by the Python monitor container on startup and periodically.
 */
export const Route = createFileRoute("/api/facility/$id/monitor/config")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const auth = request.headers.get("authorization");
        const expected = env.MONITOR_INGEST_TOKEN;
        if (!expected || auth !== `Bearer ${expected}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const db = createDatabase(env.DATABASE);

        const [fac] = await db
          .select({ id: schema.facility.id, name: schema.facility.name })
          .from(schema.facility)
          .where(eq(schema.facility.id, params.id))
          .limit(1);

        if (!fac) {
          return Response.json({ error: "Facility not found" }, { status: 404 });
        }

        const devices = await db
          .select()
          .from(schema.facilityDevice)
          .where(eq(schema.facilityDevice.facilityId, params.id));

        // Build a compact config object for the container
        const cctvDevices = devices
          .filter((d) => d.type === "CCTV")
          .map((d) => ({
            id: d.id,
            name: d.name,
            streamUrl: String(d.data.streamUrl ?? d.data.simulationStream ?? ""),
            status: d.status,
          }));

        const sensorDevices = devices
          .filter((d) => d.type === "Sensor")
          .map((d) => ({
            id: d.id,
            name: d.name,
            sensorType: String(d.data.sensorType ?? ""),
            pullUrl: String(d.data.pullUrl ?? ""),
            simulationDeviceId: String(d.data.simulationDeviceId ?? ""),
            pollIntervalMs: Number(d.data.pollInterval ?? 30) * 1000,
            threshold: Number(d.data.threshold ?? 0),
            unit: String(d.data.unit ?? ""),
          }));

        return Response.json({
          facilityId: params.id,
          facilityName: fac.name,
          cctv: cctvDevices,
          sensors: sensorDevices,
        });
      },
    },
  },
});
