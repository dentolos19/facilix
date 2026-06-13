import { eq } from "drizzle-orm";
import { createDatabase } from "#/src/lib/database";
import * as schema from "#/src/lib/database/schema";
import { createStorage } from "#/src/lib/storage";
import { type LogSeverity, normalizeFacilitySettings, shouldShowInGlobalEvents } from "./logs";
import { recordFacilityEvent, recordObservation, recordSensorReading, validateDevice } from "./utils";

const MAX_SEGMENT_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Resolve a CCTV device's stream URL based on its video source.
 *
 * - "simulation": build RTSP URL from env.CCTV_SIMULATION_RTSP_BASE + stream name.
 * - "rtsp"/"rtmp"/"http": use the raw streamUrl as-is.
 * - Returns empty string if the required fields are missing.
 */
function resolveCctvStreamUrl(data: Record<string, string | number>, simulationRtspBase: string): string {
  const videoSource = String(data.videoSource ?? "simulation");

  if (videoSource === "simulation") {
    const streamName = String(data.simulationStream ?? "");
    if (!streamName) return "";
    const base = simulationRtspBase.replace(/\/$/, "");
    return `${base}/${encodeURIComponent(streamName)}`;
  }

  return String(data.streamUrl ?? "");
}

export type MonitoringApiAction = "config" | "events" | "frames" | "segments";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKeyParts(d: Date): {
  yyyy: string;
  mm: string;
  dd: string;
  hh: string;
  min: string;
  ss: string;
  ms: string;
} {
  return {
    yyyy: String(d.getUTCFullYear()),
    mm: pad2(d.getUTCMonth() + 1),
    dd: pad2(d.getUTCDate()),
    hh: pad2(d.getUTCHours()),
    min: pad2(d.getUTCMinutes()),
    ss: pad2(d.getUTCSeconds()),
    ms: String(d.getUTCMilliseconds()).padStart(3, "0"),
  };
}

/**
 * Check + store idempotency key in D1 via raw SQL for D1 compatibility.
 * Returns the previous result if this key was already processed, or null if fresh.
 */
async function checkIdempotency(
  env: Env,
  facilityId: string,
  deviceId: string,
  action: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  try {
    // Attempt insert — if key already exists, the row won't be inserted
    // and our subsequent SELECT will find the previous result.
    const insertResult = await env.DATABASE.prepare(
      `INSERT OR IGNORE INTO idempotency_keys (id, facility_id, device_id, action, result, created_at)
       VALUES (?, ?, ?, ?, '{"success":true}', datetime('now'))`,
    )
      .bind(key, facilityId, deviceId, action)
      .run();

    // If a row was inserted, this is a fresh request
    if (insertResult.meta.changes > 0) return null;

    // Key already existed — return previous result
    const existing = await env.DATABASE.prepare(`SELECT result FROM idempotency_keys WHERE id = ?`)
      .bind(key)
      .first<{ result: string }>();

    return existing ? (JSON.parse(existing.result) as Record<string, unknown>) : null;
  } catch {
    // If table doesn't exist yet, silently pass through (no dedup)
    return null;
  }
}

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

  const simulationRtspBase = String(env.CCTV_SIMULATION_RTSP_BASE ?? "rtsp://localhost:3003");

  return Response.json({
    facilityId,
    facilityName: fac.name,
    cctv: devices
      .filter((d) => d.type === "CCTV")
      .map((d) => ({
        id: d.id,
        name: d.name,
        streamUrl: resolveCctvStreamUrl(d.data, simulationRtspBase),
        videoSource: String(d.data.videoSource ?? "simulation"),
        simulationStream: String(d.data.simulationStream ?? ""),
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

  const severity = body.severity as LogSeverity;
  const enrichedData = { ...body.data, source: "monitoring-container" };
  const observer = env.OBSERVER.getByName(facilityId);

  // 1. Always write to DO observations for Container Logs
  await recordObservation(observer, body.deviceId, body.type, severity, body.message, enrichedData);

  // 2. Persist to D1 facility_events only when the log is important or the user
  //    explicitly enabled this log type in facility settings.
  const [facRow] = await db
    .select({ settings: schema.facility.settings })
    .from(schema.facility)
    .where(eq(schema.facility.id, facilityId))
    .limit(1);
  const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);
  if (shouldShowInGlobalEvents(body.type, severity, settings)) {
    // If the event is facility-level (deviceId === facilityId), store null for deviceId.
    await recordFacilityEvent(db, facilityId, device?.id ?? null, body.type, severity, body.message, enrichedData);
  }

  // 3. Record structured sensor reading for sensor events (requires a real device)
  if ((body.type === "sensor:reading" || body.type === "sensor:alert") && body.data && device) {
    await recordSensorReading(db, facilityId, device.id, body.data).catch((err) =>
      console.error("recordSensorReading failed:", err),
    );
  }

  return Response.json({ success: true, eventId: crypto.randomUUID() });
}

async function handleFrame(request: Request, env: Env, facilityId: string): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const deviceId = request.headers.get("X-Device-Id");
  if (!deviceId) return Response.json({ error: "Missing X-Device-Id header" }, { status: 400 });

  // Idempotency key — skip duplicate frame submissions
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const exists = await checkIdempotency(env, facilityId, deviceId, "frame", idempotencyKey);
    if (exists) return Response.json({ success: true, deduplicated: true, previousResult: exists });
  }

  const db = createDatabase(env.DATABASE);
  const device = await validateDevice(db, facilityId, deviceId);
  if (!device) return Response.json({ error: "Device not found for this facility" }, { status: 404 });

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) return Response.json({ error: "Empty frame" }, { status: 400 });

  // Persist the frame to R2 so the workflow can read it durably.
  const capturedAt = new Date();
  const { yyyy, mm, dd, hh, min, ss, ms } = dateKeyParts(capturedAt);
  const sequenceHeader = request.headers.get("X-Sequence");
  const sequence = sequenceHeader ? Number(sequenceHeader) : 0;
  const fileName = `frames/${yyyy}${mm}${dd}/${deviceId}/${hh}${min}${ss}-${ms}.jpg`;
  const contentType = request.headers.get("content-type") ?? "image/jpeg";

  const storage = createStorage({ bucket: env.BUCKET, db: env.DATABASE });
  const asset = await storage.createFile(buffer, { name: fileName, type: contentType });

  // Dispatch to the durable processor — AI inference + DB writes happen there.
  await env.PROCESSOR.create({
    params: {
      kind: "frame",
      facilityId,
      deviceId,
      assetId: asset.id,
      capturedAt: capturedAt.toISOString(),
      sequence: Number.isFinite(sequence) ? sequence : 0,
    },
  });

  return Response.json({ success: true, queued: true, assetId: asset.id, sizeBytes: buffer.byteLength });
}

async function handleSegment(request: Request, env: Env, facilityId: string): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const deviceId = request.headers.get("X-Device-Id");
  if (!deviceId) return Response.json({ error: "Missing X-Device-Id header" }, { status: 400 });

  // Idempotency key — skip duplicate segment submissions
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const exists = await checkIdempotency(env, facilityId, deviceId, "segment", idempotencyKey);
    if (exists) return Response.json({ success: true, deduplicated: true, previousResult: exists });
  }

  const db = createDatabase(env.DATABASE);
  const device = await validateDevice(db, facilityId, deviceId);
  if (!device) return Response.json({ error: "Device not found for this facility" }, { status: 404 });

  const buffer = await request.arrayBuffer();
  if (buffer.byteLength === 0) return Response.json({ error: "Empty segment" }, { status: 400 });
  if (buffer.byteLength > MAX_SEGMENT_SIZE)
    return Response.json({ error: "Segment too large (max 50 MB)" }, { status: 413 });

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

  // Use date-prefixed key to avoid collision across days: YYYYMMDD/HHMMSS-ms.mp4
  const { yyyy, mm, dd, hh, min, ss, ms } = dateKeyParts(startedAt);
  const contentType = request.headers.get("content-type") ?? "video/mp4";

  const storage = createStorage({ bucket: env.BUCKET, db: env.DATABASE });

  const fileName = `${yyyy}${mm}${dd}/${hh}${min}${ss}-${ms}.mp4`;
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

  const observer = env.OBSERVER.getByName(facilityId);
  await recordObservation(
    observer,
    deviceId,
    "cctv:segment:stored",
    "info",
    `Video segment stored (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB)`,
    {
      source: "monitoring-container",
      assetId: asset.id,
      recordingId,
      durationSec,
      contentType,
      sizeBytes: buffer.byteLength,
    },
  );

  const [facRow] = await db
    .select({ settings: schema.facility.settings })
    .from(schema.facility)
    .where(eq(schema.facility.id, facilityId))
    .limit(1);
  const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);
  if (shouldShowInGlobalEvents("cctv:segment:stored", "info", settings)) {
    await recordFacilityEvent(
      db,
      facilityId,
      deviceId,
      "cctv:segment:stored",
      "info",
      `Video segment stored (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} MB)`,
      {
        source: "monitoring-container",
        assetId: asset.id,
        recordingId,
        durationSec,
        contentType,
        sizeBytes: buffer.byteLength,
      },
    );
  }

  // Dispatch the durable processor — aggregates frame detections in the
  // [startedAt, endedAt] window, optionally calls a vision model, and
  // writes the resulting summary onto video_recordings.data.
  await env.PROCESSOR.create({
    params: {
      kind: "segment",
      facilityId,
      deviceId,
      recordingId,
      assetId: asset.id,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSec: durationSec ?? 0,
    },
  });

  return Response.json({
    success: true,
    queued: true,
    recordingId,
    assetId: asset.id,
    sizeBytes: buffer.byteLength,
  });
}
