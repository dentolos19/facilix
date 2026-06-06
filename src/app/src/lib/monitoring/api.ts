import { eq } from "drizzle-orm";
import { createDatabase } from "#/src/lib/database";
import * as schema from "#/src/lib/database/schema";
import { createStorage } from "#/src/lib/storage";
import { recordFacilityEvent, recordSensorReading, validateDevice } from "./utils";

const MAX_SEGMENT_SIZE = 50 * 1024 * 1024; // 50 MB
const MIN_CONFIDENCE = 0.4;

const ANOMALY_CLASSES = new Set([
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "bus",
  "truck",
  "backpack",
  "handbag",
  "suitcase",
  "knife",
  "cell phone",
]);

export type MonitoringApiAction = "config" | "events" | "frames" | "segments";

export async function handleMonitoringApiRequest(
  request: Request,
  env: Env,
  facilityId: string,
  action: MonitoringApiAction,
): Promise<Response> {
  const expected = env.INGEST_TOKEN;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  switch (action) {
    case "config":
      return handleConfig(request, env, facilityId);
    case "events":
      return handleEvent(request, env, facilityId);
    case "frames":
      return handleFrame(request, env, facilityId);
    case "segments":
      return handleSegment(request, env, facilityId);
  }
}

async function handleConfig(request: Request, env: Env, facilityId: string): Promise<Response> {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const db = createDatabase(env.DATABASE);
  const [fac] = await db
    .select({ id: schema.facility.id, name: schema.facility.name })
    .from(schema.facility)
    .where(eq(schema.facility.id, facilityId))
    .limit(1);

  if (!fac) return Response.json({ error: "Facility not found" }, { status: 404 });

  const devices = await db.select().from(schema.facilityDevice).where(eq(schema.facilityDevice.facilityId, facilityId));

  return Response.json({
    facilityId,
    facilityName: fac.name,
    cctv: devices
      .filter((d) => d.type === "CCTV")
      .map((d) => ({
        id: d.id,
        name: d.name,
        streamUrl: String(d.data.streamUrl ?? d.data.simulationStream ?? ""),
        status: d.status,
      })),
    sensors: devices
      .filter((d) => d.type === "Sensor")
      .map((d) => ({
        id: d.id,
        name: d.name,
        dataSource: String(d.data.sensorDataSource ?? "simulation"),
        sensorType: String(d.data.sensorType ?? ""),
        pullUrl: String(d.data.pullUrl ?? ""),
        simulationDeviceId: String(d.data.simulationDeviceId ?? ""),
        payloadFormat: String(d.data.payloadFormat ?? "facilix"),
        pollIntervalMs: Number(d.data.pollInterval ?? 30) * 1000,
        threshold: Number(d.data.threshold ?? 0),
        unit: String(d.data.unit ?? ""),
      })),
  });
}

async function handleEvent(request: Request, env: Env, facilityId: string): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { deviceId?: string; type?: string; severity?: string; message?: string; data?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.deviceId || !body.type || !body.severity || !body.message) {
    return Response.json({ error: "Missing required fields: deviceId, type, severity, message" }, { status: 400 });
  }
  if (!["info", "warn", "error"].includes(body.severity)) {
    return Response.json({ error: "severity must be info, warn, or error" }, { status: 400 });
  }

  const db = createDatabase(env.DATABASE);
  const device = await validateDevice(db, facilityId, body.deviceId);
  if (!device && body.deviceId !== facilityId) {
    return Response.json({ error: "Device not found for this facility" }, { status: 404 });
  }

  const enrichedData = { ...body.data, source: "monitoring-container" };

  // System-level events (monitoring:started, monitoring:heartbeat) use facilityId as
  // deviceId but must not be inserted into device_logs because the FK references
  // facility_devices(id) and no such device row exists. Record only in Observer DO.
  if (body.deviceId === facilityId) {
    try {
      await env.OBSERVER.getByName(facilityId).recordEvent(
        body.deviceId,
        body.type,
        JSON.stringify({ level: body.severity, message: body.message, ...enrichedData }),
      );
      return Response.json({ success: true, eventId: crypto.randomUUID() });
    } catch (err) {
      console.error("Observer recordEvent failed:", err);
      return Response.json({ error: "Failed to record event" }, { status: 500 });
    }
  }

  const eventId = await recordFacilityEvent(
    db,
    env.OBSERVER.getByName(facilityId),
    facilityId,
    body.deviceId,
    body.type,
    body.severity as "info" | "warn" | "error",
    body.message,
    enrichedData,
  );

  // Record structured sensor reading for sensor events
  if (eventId && (body.type === "sensor:reading" || body.type === "sensor:alert") && body.data) {
    await recordSensorReading(db, facilityId, body.deviceId, body.data).catch((err) =>
      console.error("recordSensorReading failed:", err),
    );
  }

  return eventId
    ? Response.json({ success: true, eventId })
    : Response.json({ error: "Failed to record event" }, { status: 500 });
}

async function handleFrame(request: Request, env: Env, facilityId: string): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const deviceId = request.headers.get("X-Device-Id");
  if (!deviceId) return Response.json({ error: "Missing X-Device-Id header" }, { status: 400 });

  const db = createDatabase(env.DATABASE);
  const device = await validateDevice(db, facilityId, deviceId);
  if (!device) return Response.json({ error: "Device not found for this facility" }, { status: 404 });

  const blob = await request.blob();
  if (blob.size === 0) return Response.json({ error: "Empty frame" }, { status: 400 });

  let detections: { label: string; confidence: number; box?: unknown }[] = [];
  try {
    const aiResult = await env.AI.run("@cf/facebook/detr-resnet-50", {
      image: new Uint8Array(await blob.arrayBuffer()),
    });
    if (Array.isArray(aiResult)) {
      detections = (aiResult as Array<{ label: string; score: number; box?: unknown }>)
        .filter((d) => d.score >= MIN_CONFIDENCE)
        .map((d) => ({ label: d.label, confidence: d.score, box: d.box }));
    }
  } catch (err) {
    console.error("Workers AI inference failed:", err);
  }

  const anomalies = detections.filter((d) => ANOMALY_CLASSES.has(d.label));
  if (anomalies.length === 0) {
    await recordFacilityEvent(
      db,
      env.OBSERVER.getByName(facilityId),
      facilityId,
      deviceId,
      "cctv:frame:ok",
      "info",
      `Frame analyzed — ${detections.length} object(s) detected, no anomalies`,
      {
        source: "monitoring-container",
        objectCount: detections.length,
      },
    );
  }

  for (const det of anomalies) {
    await recordFacilityEvent(
      db,
      env.OBSERVER.getByName(facilityId),
      facilityId,
      deviceId,
      "cctv:anomaly",
      det.confidence > 0.7 ? "warn" : "info",
      `${det.label} detected (${(det.confidence * 100).toFixed(0)}%)`,
      {
        source: "monitoring-container",
        label: det.label,
        confidence: det.confidence,
        detectionCount: anomalies.length,
      },
    );
  }

  return Response.json({ success: true, anomalyCount: anomalies.length, totalDetections: detections.length });
}

async function handleSegment(request: Request, env: Env, facilityId: string): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const deviceId = request.headers.get("X-Device-Id");
  if (!deviceId) return Response.json({ error: "Missing X-Device-Id header" }, { status: 400 });

  const db = createDatabase(env.DATABASE);
  const device = await validateDevice(db, facilityId, deviceId);
  if (!device) return Response.json({ error: "Device not found for this facility" }, { status: 404 });

  const blob = await request.blob();
  if (blob.size === 0) return Response.json({ error: "Empty segment" }, { status: 400 });
  if (blob.size > MAX_SEGMENT_SIZE) return Response.json({ error: "Segment too large (max 50 MB)" }, { status: 413 });

  const durationHeader = request.headers.get("X-Duration-Sec");
  const parsedDurationSec = durationHeader ? Number(durationHeader) : undefined;
  const durationSec =
    parsedDurationSec !== undefined && Number.isFinite(parsedDurationSec) && parsedDurationSec > 0
      ? parsedDurationSec
      : undefined;
  const timestampHeader = request.headers.get("X-Timestamp");
  const startedAt = timestampHeader ? new Date(timestampHeader) : new Date();
  if (Number.isNaN(startedAt.getTime())) return Response.json({ error: "Invalid X-Timestamp header" }, { status: 400 });
  const endedAt = durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : startedAt;

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const hh = pad2(startedAt.getUTCHours());
  const mm = pad2(startedAt.getUTCMinutes());
  const ss = pad2(startedAt.getUTCSeconds());
  const ms = String(startedAt.getUTCMilliseconds()).padStart(3, "0");
  const contentType = request.headers.get("content-type") ?? "video/mp4";
  const buffer = await blob.arrayBuffer();

  const storage = createStorage({ bucket: env.BUCKET, db: env.DATABASE });

  const fileName = `${hh}${mm}${ss}-${ms}.mp4`;
  const asset = await storage.createFile(buffer, { name: fileName, type: contentType });

  const recordingId = crypto.randomUUID();
  await db.insert(schema.videoRecording).values({
    id: recordingId,
    assetId: asset.id,
    facilityId,
    deviceId,
    durationSec,
    startedAt,
    endedAt,
  });

  await recordFacilityEvent(
    db,
    env.OBSERVER.getByName(facilityId),
    facilityId,
    deviceId,
    "cctv:segment:stored",
    "info",
    `Video segment stored (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB)`,
    {
      source: "monitoring-container",
      r2Key: asset.id,
      recordingId,
      durationSec,
      contentType,
      sizeBytes: buffer.byteLength,
    },
  );

  return Response.json({ success: true, recordingId, r2Key: asset.id, sizeBytes: buffer.byteLength });
}
