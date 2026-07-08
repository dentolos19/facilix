import { toolDefinition } from "@tanstack/ai";
import { env } from "cloudflare:workers";
import { and, count, desc, eq, gte, like, lt, or } from "drizzle-orm";
import { z } from "zod";

import { summarizeImage, summarizeVideo } from "#/lib/ai";
import { createDatabase, schema } from "#/lib/database";
import type { UiPayload } from "#/lib/chat/ui";

function deviceStatusCounts(
  devices: Array<{ status: string }>,
): { online: number; offline: number; error: number; degraded: number } {
  let online = 0;
  let offline = 0;
  let error = 0;
  let degraded = 0;
  for (const d of devices) {
    if (d.status === "online") online++;
    else if (d.status === "offline") offline++;
    else if (d.status === "error") error++;
    else if (d.status === "degraded") degraded++;
    else online++;
  }
  return { online, offline, error, degraded };
}

const emptyInput = z.object({});

const getFacilityOverviewDefinition = toolDefinition({
  name: "get_facility_overview",
  description:
    "Get the facility name, configuration, zones, devices, device status, notes, and latest sensor readings. Use this first for broad facility questions.",
  inputSchema: emptyInput,
});

const searchFacilityEventsDefinition = toolDefinition({
  name: "search_facility_events",
  description:
    "Search recent facility events and alerts. Returns event details plus links and metadata for attached images or video.",
  inputSchema: z.object({
    query: z.string().max(160).optional().describe("Words to find in the event type or message"),
    severity: z.enum(["info", "warn", "error"]).optional(),
    deviceId: z.string().optional(),
    since: z.string().datetime().optional().describe("Only include events at or after this ISO timestamp"),
    before: z.string().datetime().optional().describe("Page through older events before this ISO timestamp"),
    limit: z.number().int().min(1).max(100).optional(),
  }),
});

const getSensorHistoryDefinition = toolDefinition({
  name: "get_sensor_history",
  description:
    "Read timestamped sensor measurements for the whole facility or one device, including status, battery, and signal.",
  inputSchema: z.object({
    deviceId: z.string().optional(),
    before: z.string().datetime().optional().describe("Page through older readings before this ISO timestamp"),
    limit: z.number().int().min(1).max(200).optional(),
  }),
});

const listFacilityMediaDefinition = toolDefinition({
  name: "list_facility_media",
  description:
    "List facility media that can be inspected: CCTV recordings, event attachments, and raw or annotated prediction frames.",
  inputSchema: z.object({
    deviceId: z.string().optional(),
    before: z.string().datetime().optional().describe("Page through older media before this ISO timestamp"),
    limit: z.number().int().min(1).max(50).optional(),
  }),
});

const inspectFacilityMediaDefinition = toolDefinition({
  name: "inspect_facility_media",
  description:
    "Visually inspect one facility image or video by asset ID and answer a focused question about its contents. Call list_facility_media or search_facility_events first to obtain an asset ID.",
  inputSchema: z.object({
    assetId: z.string().min(1),
    question: z.string().min(1).max(1000),
  }),
});

function toIso(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function getAssetMetadata(assetIds: string[]) {
  if (assetIds.length === 0) return new Map<string, { name: string; type: string; size: number }>();

  const db = createDatabase(env.DATABASE);
  const uniqueIds = [...new Set(assetIds)];
  const rows = await db.query.asset.findMany({
    where: (asset, { inArray }) => inArray(asset.id, uniqueIds),
    columns: { id: true, name: true, type: true, size: true },
  });
  return new Map(rows.map((row) => [row.id, { name: row.name, type: row.type, size: row.size }]));
}

export function createChatTools(facilityId: string) {
  const getFacilityOverview = getFacilityOverviewDefinition.server(async () => {
    const db = createDatabase(env.DATABASE);
    const [facilityRows, zones, devices, sensorReadings, eventCounts] = await Promise.all([
      db.select().from(schema.facility).where(eq(schema.facility.id, facilityId)).limit(1),
      db.select().from(schema.facilityZone).where(eq(schema.facilityZone.facilityId, facilityId)),
      db.select().from(schema.facilityDevice).where(eq(schema.facilityDevice.facilityId, facilityId)),
      db
        .select()
        .from(schema.sensorReading)
        .where(eq(schema.sensorReading.facilityId, facilityId))
        .orderBy(desc(schema.sensorReading.timestamp))
        .limit(1000),
      db.select({ count: count() }).from(schema.facilityEvent).where(eq(schema.facilityEvent.facilityId, facilityId)),
    ]);

    const facility = facilityRows[0];
    if (!facility) throw new Error("Facility not found");

    const latestReadingByDevice = new Map<string, (typeof sensorReadings)[number]>();
    for (const reading of sensorReadings) {
      if (!latestReadingByDevice.has(reading.deviceId)) latestReadingByDevice.set(reading.deviceId, reading);
    }

    const zoneNames = new Map(zones.map((zone) => [zone.id, zone.name]));
    const counts = deviceStatusCounts(devices);
    const eventCount = eventCounts[0]?.count ?? 0;
    const layoutItems = (facility.data?.items ?? []).map((lay) => ({
      id: lay.id,
      x: lay.x,
      y: lay.y,
      width: lay.width,
      height: lay.height,
    }));
    const layoutById = new Map(layoutItems.map((l) => [l.id, l]));

    const mapItems = devices.map((device) => {
      const lay = layoutById.get(device.id);
      const zoneName = device.zoneId ? (zoneNames.get(device.zoneId) ?? null) : null;
      return {
        id: device.id,
        type: device.type as "CCTV" | "Sensor" | "Signal",
        name: device.name,
        status: device.status,
        x: lay?.x ?? 0,
        y: lay?.y ?? 0,
        width: lay?.width ?? 36,
        height: lay?.height ?? 36,
        zoneId: device.zoneId,
        zoneName,
        props: device.data,
      };
    });

    const zoneMapItems = zones.map((zone) => {
      const lay = layoutById.get(zone.id);
      return {
        id: zone.id,
        type: "Zone" as const,
        name: zone.name,
        status: "active",
        x: lay?.x ?? 0,
        y: lay?.y ?? 0,
        width: lay?.width ?? 140,
        height: lay?.height ?? 90,
        zoneId: null,
        zoneName: null,
        props: zone.data,
      };
    });

    const deviceListItems = devices.map((device) => {
      const latest = latestReadingByDevice.get(device.id);
      return {
        id: device.id,
        name: device.name,
        type: device.type,
        status: device.status,
        zoneId: device.zoneId,
        zoneName: device.zoneId ? (zoneNames.get(device.zoneId) ?? null) : null,
        notes: device.notes,
        latestReading: latest
          ? {
              sensorType: latest.sensorType,
              value: latest.value,
              unit: latest.unit,
              status: latest.status,
              secondaryValue: latest.secondaryValue,
              secondaryUnit: latest.secondaryUnit,
              batteryPct: latest.batteryPct,
              signalRssiDbm: latest.signalRssiDbm,
              timestamp: toIso(latest.timestamp),
            }
          : null,
      };
    });

    const healthScore =
      devices.length === 0
        ? 100
        : Math.round(
            ((counts.online + counts.degraded * 0.5) / devices.length) * 100,
          );

    const ui: UiPayload[] = [
      {
        kind: "facility-summary",
        data: {
          facilityName: facility.name,
          zoneCount: zones.length,
          deviceCount: devices.length,
          onlineCount: counts.online,
          errorCount: counts.error,
          offlineCount: counts.offline,
          eventCount,
          healthScore,
        },
      },
      {
        kind: "facility-map",
        data: {
          items: [...zoneMapItems, ...mapItems],
          highlightedDeviceIds: [],
        },
      },
      {
        kind: "device-list",
        data: deviceListItems,
      },
    ];

    return {
      facility: {
        id: facility.id,
        name: facility.name,
        configuration: facility.data,
        settings: facility.settings,
        createdAt: toIso(facility.createdAt),
        updatedAt: toIso(facility.updatedAt),
      },
      zones: zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        notes: zone.notes,
        configuration: zone.data,
      })),
      devices: devices.map((device) => {
        const latest = latestReadingByDevice.get(device.id);
        return {
          id: device.id,
          name: device.name,
          type: device.type,
          status: device.status,
          zoneId: device.zoneId,
          zoneName: device.zoneId ? (zoneNames.get(device.zoneId) ?? null) : null,
          notes: device.notes,
          configuration: device.data,
          latestSensorReading: latest
            ? {
                sensorType: latest.sensorType,
                value: latest.value,
                unit: latest.unit,
                status: latest.status,
                secondaryValue: latest.secondaryValue,
                secondaryUnit: latest.secondaryUnit,
                batteryPct: latest.batteryPct,
                signalRssiDbm: latest.signalRssiDbm,
                timestamp: toIso(latest.timestamp),
              }
            : null,
        };
      }),
      ui,
    };
  });

  const searchFacilityEvents = searchFacilityEventsDefinition.server(
    async ({ query, severity, deviceId, since, before, limit }) => {
      const db = createDatabase(env.DATABASE);
      const conditions = [eq(schema.facilityEvent.facilityId, facilityId)];
      if (severity) conditions.push(eq(schema.facilityEvent.severity, severity));
      if (deviceId) conditions.push(eq(schema.facilityEvent.deviceId, deviceId));
      if (since) conditions.push(gte(schema.facilityEvent.createdAt, new Date(since)));
      if (before) conditions.push(lt(schema.facilityEvent.createdAt, new Date(before)));
      if (query) {
        const pattern = `%${query}%`;
        conditions.push(or(like(schema.facilityEvent.type, pattern), like(schema.facilityEvent.message, pattern))!);
      }

      const events = await db
        .select()
        .from(schema.facilityEvent)
        .where(and(...conditions))
        .orderBy(desc(schema.facilityEvent.createdAt))
        .limit(limit ?? 30);

      const eventIds = events.map((event) => event.id);
      const attachments =
        eventIds.length === 0
          ? []
          : await db.query.eventAttachment.findMany({
              where: (attachment, { inArray }) => inArray(attachment.eventId, eventIds),
              orderBy: (attachment, { asc }) => [asc(attachment.sortOrder)],
            });
      const metadata = await getAssetMetadata(attachments.map((attachment) => attachment.assetId));
      const attachmentsByEvent = new Map<string, typeof attachments>();
      for (const attachment of attachments) {
        const current = attachmentsByEvent.get(attachment.eventId) ?? [];
        current.push(attachment);
        attachmentsByEvent.set(attachment.eventId, current);
      }

      const deviceRows =
        events.length === 0
          ? []
          : await db
              .select({ id: schema.facilityDevice.id, name: schema.facilityDevice.name })
              .from(schema.facilityDevice)
              .where(eq(schema.facilityDevice.facilityId, facilityId));
      const deviceNameMap = new Map(deviceRows.map((d) => [d.id, d.name]));
      return {
        count: events.length,
        events: events.map((event) => ({
          id: event.id,
          deviceId: event.deviceId,
          severity: event.severity,
          type: event.type,
          message: event.message,
          data: event.data,
          createdAt: toIso(event.createdAt),
          attachments: (attachmentsByEvent.get(event.id) ?? []).map((attachment) => ({
            assetId: attachment.assetId,
            kind: attachment.kind,
            variant: attachment.variant,
            role: attachment.role,
            metadata: attachment.metadata,
            media: metadata.get(attachment.assetId) ?? null,
            url: `/assets/${encodeURIComponent(attachment.assetId)}`,
          })),
        })),
        ui: [
          {
            kind: "event-list",
            data: {
              count: events.length,
              events: events.map((event) => ({
                id: event.id,
                deviceId: event.deviceId,
                deviceName: event.deviceId ? (deviceNameMap.get(event.deviceId) ?? null) : null,
                severity: event.severity,
                type: event.type,
                message: event.message,
                createdAt: toIso(event.createdAt),
                zoneName: null,
                hasMedia: ((attachmentsByEvent.get(event.id) ?? []).length > 0),
                mediaCount: (attachmentsByEvent.get(event.id) ?? []).length,
              })),
              deviceFilter: deviceId ?? undefined,
            },
          },
        ] as UiPayload[],
      };
    },
  );

  const getSensorHistory = getSensorHistoryDefinition.server(async ({ deviceId, before, limit }) => {
    const db = createDatabase(env.DATABASE);
    const conditions = [eq(schema.sensorReading.facilityId, facilityId)];
    if (deviceId) conditions.push(eq(schema.sensorReading.deviceId, deviceId));
    if (before) conditions.push(lt(schema.sensorReading.timestamp, new Date(before)));

    const [readings, devices] = await Promise.all([
      db
        .select()
        .from(schema.sensorReading)
        .where(and(...conditions))
        .orderBy(desc(schema.sensorReading.timestamp))
        .limit(limit ?? 50),
      db
        .select({ id: schema.facilityDevice.id, name: schema.facilityDevice.name })
        .from(schema.facilityDevice)
        .where(eq(schema.facilityDevice.facilityId, facilityId)),
    ]);
    const deviceNames = new Map(devices.map((device) => [device.id, device.name]));

    const readingsData = readings.map((reading) => ({
      deviceId: reading.deviceId,
      deviceName: deviceNames.get(reading.deviceId) ?? "Unknown device",
      sensorType: reading.sensorType,
      value: reading.value,
      unit: reading.unit,
      status: reading.status,
      secondaryValue: reading.secondaryValue,
      secondaryUnit: reading.secondaryUnit,
      batteryPct: reading.batteryPct,
      signalRssiDbm: reading.signalRssiDbm,
      source: reading.source,
      timestamp: toIso(reading.timestamp),
    }));

    return {
      count: readings.length,
      readings: readingsData,
      ui: [
        {
          kind: "sensor-history",
          data: {
            readings: readingsData.map((r) => ({
              deviceId: r.deviceId,
              deviceName: r.deviceName,
              sensorType: r.sensorType,
              value: r.value,
              unit: r.unit,
              status: r.status,
              batteryPct: r.batteryPct,
              timestamp: r.timestamp,
            })),
          },
        },
      ] as UiPayload[],
    };
  });

  const listFacilityMedia = listFacilityMediaDefinition.server(async ({ deviceId, before, limit }) => {
    const db = createDatabase(env.DATABASE);
    const rowLimit = limit ?? 20;
    const recordingConditions = [eq(schema.videoSegment.facilityId, facilityId)];
    const predictionConditions = [eq(schema.predictionOutput.facilityId, facilityId)];
    const eventConditions = [eq(schema.facilityEvent.facilityId, facilityId)];
    if (deviceId) {
      recordingConditions.push(eq(schema.videoSegment.deviceId, deviceId));
      predictionConditions.push(eq(schema.predictionOutput.deviceId, deviceId));
      eventConditions.push(eq(schema.facilityEvent.deviceId, deviceId));
    }
    if (before) {
      const beforeDate = new Date(before);
      recordingConditions.push(lt(schema.videoSegment.createdAt, beforeDate));
      predictionConditions.push(lt(schema.predictionOutput.createdAt, beforeDate));
      eventConditions.push(lt(schema.eventAttachment.createdAt, beforeDate));
    }

    const [recordings, predictions, eventMedia] = await Promise.all([
      db
        .select()
        .from(schema.videoSegment)
        .where(and(...recordingConditions))
        .orderBy(desc(schema.videoSegment.createdAt))
        .limit(rowLimit),
      db
        .select()
        .from(schema.predictionOutput)
        .where(and(...predictionConditions))
        .orderBy(desc(schema.predictionOutput.createdAt))
        .limit(rowLimit),
      db
        .select({
          eventId: schema.eventAttachment.eventId,
          deviceId: schema.facilityEvent.deviceId,
          assetId: schema.eventAttachment.assetId,
          kind: schema.eventAttachment.kind,
          variant: schema.eventAttachment.variant,
          role: schema.eventAttachment.role,
          metadata: schema.eventAttachment.metadata,
          createdAt: schema.eventAttachment.createdAt,
        })
        .from(schema.eventAttachment)
        .innerJoin(schema.facilityEvent, eq(schema.eventAttachment.eventId, schema.facilityEvent.id))
        .where(and(...eventConditions))
        .orderBy(desc(schema.eventAttachment.createdAt))
        .limit(rowLimit),
    ]);

    const assetIds = [
      ...recordings.map((row) => row.assetId),
      ...predictions.flatMap((row) => [row.beforeAssetId, row.afterAssetId]),
      ...eventMedia.map((row) => row.assetId),
    ];
    const metadata = await getAssetMetadata(assetIds);
    const media = (assetId: string) => ({
      assetId,
      ...(metadata.get(assetId) ?? { name: "Unknown asset", type: "application/octet-stream", size: 0 }),
      url: `/assets/${encodeURIComponent(assetId)}`,
    });

    function mediaKind(
      type: string,
    ): "image" | "video" | "unknown" {
      if (type.startsWith("video/")) return "video";
      if (type.startsWith("image/")) return "image";
      return "unknown";
    }

    const recordingEntries = {
      kind: "media-gallery",
      data: {
        entries: [
          ...recordings.map((recording) => {
            const m = media(recording.assetId);
            return {
              id: recording.id,
              kind: mediaKind(m.type),
              source: "recording" as const,
              deviceId: recording.deviceId,
              name: m.name,
              url: m.url,
              durationSec: recording.durationSec,
              createdAt: toIso(recording.startedAt),
            };
          }),
          ...predictions.flatMap((prediction) => {
            const b = media(prediction.beforeAssetId);
            const a = media(prediction.afterAssetId);
            const results: Array<{
              id: string;
              kind: "image" | "video" | "unknown";
              source: "prediction";
              deviceId: string | null;
              name: string;
              url: string;
              createdAt: string;
            }> = [];
            results.push({
              id: `${prediction.id}-before`,
              kind: mediaKind(b.type),
              source: "prediction",
              deviceId: prediction.deviceId,
              name: `Before ${b.name}`,
              url: b.url,
              createdAt: toIso(prediction.createdAt),
            });
            results.push({
              id: `${prediction.id}-annotated`,
              kind: mediaKind(a.type),
              source: "prediction",
              deviceId: prediction.deviceId,
              name: `Annotated ${a.name}`,
              url: a.url,
              createdAt: toIso(prediction.createdAt),
            });
            return results;
          }),
          ...eventMedia.map((attachment) => {
            const m = media(attachment.assetId);
            return {
              id: attachment.eventId ? `event-${attachment.eventId}` : m.assetId,
              kind: mediaKind(attachment.kind === "video" ? "video/" : attachment.kind === "image" ? "image/" : "application/octet-stream"),
              source: "event" as const,
              deviceId: attachment.deviceId,
              name: m.name,
              url: m.url,
              createdAt: toIso(attachment.createdAt),
            };
          }),
        ],
      },
    };

    return {
      recordings: recordings.map((recording) => ({
        id: recording.id,
        deviceId: recording.deviceId,
        durationSec: recording.durationSec,
        startedAt: toIso(recording.startedAt),
        endedAt: recording.endedAt ? toIso(recording.endedAt) : null,
        analysis: recording.data,
        media: media(recording.assetId),
      })),
      predictionFrames: predictions.map((prediction) => ({
        id: prediction.id,
        deviceId: prediction.deviceId,
        segmentId: prediction.segmentId,
        pluginId: prediction.pluginId,
        outputName: prediction.outputName,
        frameIndex: prediction.frameIndex,
        atSec: prediction.atSec,
        predictions: prediction.predictions,
        image: prediction.image,
        before: media(prediction.beforeAssetId),
        annotated: media(prediction.afterAssetId),
      })),
      eventAttachments: eventMedia.map((attachment) => ({
        eventId: attachment.eventId,
        deviceId: attachment.deviceId,
        kind: attachment.kind,
        variant: attachment.variant,
        role: attachment.role,
        metadata: attachment.metadata,
        createdAt: toIso(attachment.createdAt),
        media: media(attachment.assetId),
      })),
      ui: [recordingEntries] as UiPayload[],
    };
  });

  const inspectFacilityMedia = inspectFacilityMediaDefinition.server(async ({ assetId, question }) => {
    const db = createDatabase(env.DATABASE);
    const [recording, prediction, attachment, assetRows] = await Promise.all([
      db
        .select({ id: schema.videoSegment.id })
        .from(schema.videoSegment)
        .where(and(eq(schema.videoSegment.facilityId, facilityId), eq(schema.videoSegment.assetId, assetId)))
        .limit(1),
      db
        .select({ id: schema.predictionOutput.id })
        .from(schema.predictionOutput)
        .where(
          and(
            eq(schema.predictionOutput.facilityId, facilityId),
            or(eq(schema.predictionOutput.beforeAssetId, assetId), eq(schema.predictionOutput.afterAssetId, assetId)),
          ),
        )
        .limit(1),
      db
        .select({ id: schema.eventAttachment.id })
        .from(schema.eventAttachment)
        .innerJoin(schema.facilityEvent, eq(schema.eventAttachment.eventId, schema.facilityEvent.id))
        .where(and(eq(schema.facilityEvent.facilityId, facilityId), eq(schema.eventAttachment.assetId, assetId)))
        .limit(1),
      db.select().from(schema.asset).where(eq(schema.asset.id, assetId)).limit(1),
    ]);

    if (recording.length === 0 && prediction.length === 0 && attachment.length === 0) {
      throw new Error("That media asset does not belong to this facility.");
    }

    const asset = assetRows[0];
    if (!asset) throw new Error("Media metadata was not found.");
    if (asset.size > 30 * 1024 * 1024) {
      return {
        status: "too_large",
        message: "This media file is larger than the 30 MB inspection limit.",
        asset: { id: asset.id, name: asset.name, type: asset.type, size: asset.size },
      };
    }

    const object = await env.BUCKET.get(assetId);
    if (!object) throw new Error("The media file is missing from storage.");
    const bytes = await object.arrayBuffer();
    const prompt = `This media belongs to a monitored facility. Answer the user's focused question using only what is visible or audible in the media. Distinguish direct observations from uncertainty.\n\nQuestion: ${question}`;
    const answer = asset.type.startsWith("video/")
      ? await summarizeVideo(bytes, asset.type, prompt, { maxTokens: 800 })
      : asset.type.startsWith("image/")
        ? await summarizeImage(bytes, asset.type, prompt, { maxTokens: 800 })
        : null;

    const inspectionResult = {
      status: answer ? "inspected" : "unsupported",
      answer:
        answer ??
        `Media type ${asset.type} cannot be visually inspected, but its metadata is available to the assistant.`,
      asset: {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        size: asset.size,
        url: `/assets/${encodeURIComponent(asset.id)}`,
      },
    };

    if (answer) {
      return {
        ...inspectionResult,
        ui: [
          {
            kind: "media-inspection",
            data: {
              assetName: asset.name,
              assetType: asset.type,
              assetUrl: `/assets/${encodeURIComponent(asset.id)}`,
              status: "inspected",
              answer,
            },
          },
        ] as UiPayload[],
      };
    }

    return inspectionResult;
  });

  return [getFacilityOverview, searchFacilityEvents, getSensorHistory, listFacilityMedia, inspectFacilityMedia];
}
