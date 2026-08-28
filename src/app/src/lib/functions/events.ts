import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { requireFacilityAccess } from "#/lib/functions/access";
import { normalizeFacilitySettings, shouldShowInGlobalEvents } from "#/lib/monitoring/logs";
import type { EventAttachmentKind, EventAttachmentRole, EventAttachmentVariant } from "#/lib/monitoring/utils";
import type { JsonObject, JsonValue } from "#/routes/(platform)/facility.$id/-helpers/types";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FacilityEventRow {
  id: string;
  facilityId: string;
  deviceId: string | null;
  severity: "info" | "warn" | "error";
  type: string;
  message: string;
  data: JsonObject;
  attachments: FacilityEventAttachmentRow[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FacilityEventAttachmentRow {
  id: string;
  assetId: string;
  name: string;
  type: string;
  size: number;
  kind: EventAttachmentKind;
  variant: EventAttachmentVariant;
  role: EventAttachmentRole;
  sortOrder: number;
  metadata: JsonObject;
  url: string;
}

export interface FacilityEventView extends FacilityEventRow {
  deviceName: string;
  deviceType: string;
  zoneName?: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: FacilityEventRow[];
}

const INCIDENT_GROUP_WINDOW_MS = 10 * 60 * 1000;

function toRow(r: typeof schema.facilityEvent.$inferSelect): FacilityEventRow {
  return {
    id: r.id,
    facilityId: r.facilityId,
    deviceId: r.deviceId,
    severity: r.severity as "info" | "warn" | "error",
    type: r.type,
    message: r.message,
    data: r.data,
    attachments: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function attachEventAttachments(
  db: ReturnType<typeof createDatabase>,
  events: FacilityEventRow[],
): Promise<FacilityEventRow[]> {
  if (events.length === 0) return events;

  const rows = await db
    .select({
      id: schema.eventAttachment.id,
      eventId: schema.eventAttachment.eventId,
      assetId: schema.eventAttachment.assetId,
      kind: schema.eventAttachment.kind,
      variant: schema.eventAttachment.variant,
      role: schema.eventAttachment.role,
      sortOrder: schema.eventAttachment.sortOrder,
      metadata: schema.eventAttachment.metadata,
      name: schema.asset.name,
      type: schema.asset.type,
      size: schema.asset.size,
    })
    .from(schema.eventAttachment)
    .innerJoin(schema.asset, eq(schema.eventAttachment.assetId, schema.asset.id))
    .where(
      inArray(
        schema.eventAttachment.eventId,
        events.map((event) => event.id),
      ),
    )
    .orderBy(asc(schema.eventAttachment.sortOrder), asc(schema.eventAttachment.createdAt));

  const byEvent = new Map<string, FacilityEventAttachmentRow[]>();
  for (const row of rows) {
    const list = byEvent.get(row.eventId) ?? [];
    list.push({
      id: row.id,
      assetId: row.assetId,
      name: row.name,
      type: row.type,
      size: row.size,
      kind: row.kind as EventAttachmentKind,
      variant: row.variant as EventAttachmentVariant,
      role: row.role as EventAttachmentRole,
      sortOrder: row.sortOrder,
      metadata: row.metadata,
      url: `/assets/${encodeURIComponent(row.assetId)}`,
    });
    byEvent.set(row.eventId, list);
  }

  return events.map((event) => ({ ...event, attachments: byEvent.get(event.id) ?? [] }));
}

export function groupFacilityEvents(events: FacilityEventView[]): FacilityEventView[] {
  const grouped: FacilityEventView[] = [];
  const activeGroups = new Map<string, FacilityEventView>();

  for (const event of events) {
    const candidate: FacilityEventView = {
      ...event,
      data: { ...event.data },
      attachments: [...event.attachments],
      occurrences: [...event.occurrences],
    };
    const incidentKey = getIncidentKey(candidate);
    if (!incidentKey) {
      grouped.push(candidate);
      continue;
    }

    const key = `${candidate.deviceId ?? "facility"}:${incidentKey}`;
    const existing = activeGroups.get(key);
    const withinWindow =
      existing &&
      new Date(existing.firstSeen).getTime() - new Date(candidate.createdAt).getTime() <= INCIDENT_GROUP_WINDOW_MS;

    if (!existing || !withinWindow) {
      grouped.push(candidate);
      activeGroups.set(key, candidate);
      continue;
    }

    existing.id = candidate.id;
    existing.occurrenceCount += 1;
    existing.firstSeen = candidate.createdAt;
    existing.occurrences.push(candidate);
    existing.severity = higherSeverity(existing.severity, candidate.severity);
    existing.attachments = deduplicateAttachments([...existing.attachments, ...candidate.attachments]);
  }

  return grouped.map((event) => {
    if (event.type !== "cctv:detection:alert") return event;
    const summary = compileIncidentSummary(event.occurrences);
    const findings = uniqueJsonValues(event.occurrences.flatMap((occurrence) => extractEventFindings(occurrence)));
    return {
      ...event,
      data: {
        ...event.data,
        ...(findings.length > 0 ? { findings } : {}),
        incidentSummary: summary.text,
        incidentSummarySource: summary.source,
        occurrenceCount: event.occurrenceCount,
        firstSeen: new Date(event.firstSeen).toISOString(),
        lastSeen: new Date(event.lastSeen).toISOString(),
      },
    };
  });
}

function extractEventFindings(event: FacilityEventRow): JsonValue[] {
  if (Array.isArray(event.data.findings)) return event.data.findings;
  return [
    {
      pluginId: typeof event.data.pluginId === "string" ? event.data.pluginId : null,
      pluginName: typeof event.data.pluginName === "string" ? event.data.pluginName : null,
      category: typeof event.data.category === "string" ? event.data.category : null,
      alertKind: typeof event.data.alertKind === "string" ? event.data.alertKind : null,
      description: typeof event.data.description === "string" ? event.data.description : null,
      reason: typeof event.data.reason === "string" ? event.data.reason : event.message,
      recommendedAction: typeof event.data.recommendedAction === "string" ? event.data.recommendedAction : null,
      severity: event.severity,
    },
  ];
}

function getIncidentKey(event: FacilityEventView): string | null {
  if (event.type !== "cctv:detection:alert") return null;
  if (typeof event.data.incidentKey === "string" && event.data.incidentKey.length > 0) {
    return event.data.incidentKey;
  }

  const labels = Array.isArray(event.data.matchedLabels)
    ? event.data.matchedLabels.filter((label): label is string => typeof label === "string").sort()
    : [];
  return [
    typeof event.data.pluginId === "string" ? event.data.pluginId : "unknown-plugin",
    typeof event.data.alertKind === "string" ? event.data.alertKind : "alert",
    labels.join(","),
    typeof event.data.reason === "string" ? event.data.reason : event.message,
  ].join(":");
}

function compileIncidentSummary(events: FacilityEventRow[]): { text: string; source: "ai" | "compiled" } {
  const aiSummaries = [
    ...new Set(
      events
        .map((event) => event.data.sceneSummary)
        .filter((summary): summary is string => typeof summary === "string" && summary.length > 0),
    ),
  ];
  const occurrenceText = events.length > 1 ? ` This pattern appeared in ${events.length} related observations.` : "";
  if (aiSummaries.length > 0) return { text: `${aiSummaries.join(" ")}${occurrenceText}`, source: "ai" };

  const reasons = [
    ...new Set(
      events
        .flatMap((event) => {
          if (Array.isArray(event.data.findings)) {
            return event.data.findings.flatMap((finding) =>
              finding && typeof finding === "object" && !Array.isArray(finding) && typeof finding.reason === "string"
                ? [finding.reason]
                : [],
            );
          }
          return typeof event.data.reason === "string" ? [event.data.reason] : [];
        })
        .filter(Boolean),
    ),
  ];
  const prefix =
    events.length > 1 ? `${events.length} related CCTV observations were grouped.` : "CCTV evidence was recorded.";
  return { text: reasons.length > 0 ? `${prefix} ${reasons.join(" ")}` : prefix, source: "compiled" };
}

function deduplicateAttachments(attachments: FacilityEventAttachmentRow[]): FacilityEventAttachmentRow[] {
  const byAsset = new Map<string, FacilityEventAttachmentRow>();
  for (const attachment of attachments) {
    const key = `${attachment.assetId}:${attachment.variant}`;
    if (!byAsset.has(key)) byAsset.set(key, attachment);
  }
  return [...byAsset.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "video" ? -1 : 1;
    return left.sortOrder - right.sortOrder;
  });
}

function uniqueJsonValues<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function higherSeverity(
  left: FacilityEventRow["severity"],
  right: FacilityEventRow["severity"],
): FacilityEventRow["severity"] {
  const rank = { info: 0, warn: 1, error: 2 } as const;
  return rank[right] > rank[left] ? right : left;
}

// ─── Server functions ──────────────────────────────────────────────────────

/**
 * Get paginated facility-level events for a facility, filtered by settings.
 * Events that are disabled in facility settings are excluded.
 * Results are newest-first, limited to `limit` (default 200, max 500).
 * Pass `before` (ISO timestamp or Date) for cursor-based pagination.
 */
export const getFacilityEvents = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; limit?: number; before?: string; includeGroupingContext?: boolean }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);
    const limit = Math.min(Math.max(1, data.limit ?? 200), 500);

    const [facRow, devices] = await Promise.all([
      db
        .select({ settings: schema.facility.settings })
        .from(schema.facility)
        .where(eq(schema.facility.id, data.facilityId))
        .limit(1),
      db
        .select({ id: schema.facilityDevice.id, name: schema.facilityDevice.name })
        .from(schema.facilityDevice)
        .where(eq(schema.facilityDevice.facilityId, data.facilityId)),
    ]);

    const deviceNameMap = new Map(devices.map((d) => [d.id, d.name]));
    const settings = normalizeFacilitySettings(facRow[0]?.settings ?? undefined);

    const conditions = [eq(schema.facilityEvent.facilityId, data.facilityId)];

    if (data.before) {
      conditions.push(lt(schema.facilityEvent.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select()
      .from(schema.facilityEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(limit * 3);

    const filtered = rows.map(toRow).filter((ev) => shouldShowInGlobalEvents(ev.type, ev.severity, settings));

    const withAttachments = await attachEventAttachments(db, filtered);
    const views = withAttachments.map(
      (ev): FacilityEventView => ({
        ...ev,
        deviceName: ev.deviceId ? (deviceNameMap.get(ev.deviceId) ?? "Unknown Device") : "System",
        deviceType: "",
        occurrenceCount: 1,
        firstSeen: ev.createdAt,
        lastSeen: ev.createdAt,
        occurrences: [ev],
      }),
    );
    return views.slice(0, data.includeGroupingContext ? limit * 3 : limit);
  });

/**
 * Get paginated events for a specific device, filtered by settings.
 * Events that are disabled in facility settings are excluded.
 * Results are newest-first, limited to `limit` (default 200, max 500).
 * Pass `before` (ISO timestamp or Date) for cursor-based pagination.
 */
export const getDeviceEvents = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; deviceId: string; limit?: number; before?: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.deviceId) throw new Error("Device ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);
    const limit = Math.min(Math.max(1, data.limit ?? 200), 500);

    // Load facility settings for filtering
    const [facRow] = await db
      .select({ settings: schema.facility.settings })
      .from(schema.facility)
      .where(eq(schema.facility.id, data.facilityId))
      .limit(1);
    const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);

    const conditions = [
      eq(schema.facilityEvent.facilityId, data.facilityId),
      eq(schema.facilityEvent.deviceId, data.deviceId),
    ];

    if (data.before) {
      conditions.push(lt(schema.facilityEvent.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select()
      .from(schema.facilityEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(limit * 3); // Fetch more to account for filtering

    // Filter by settings
    const filtered = rows
      .map(toRow)
      .filter((ev) => shouldShowInGlobalEvents(ev.type, ev.severity, settings))
      .slice(0, limit);

    return attachEventAttachments(db, filtered);
  });

/**
 * Get ALL events for a facility (unfiltered, for logs dialog).
 * Shows every event regardless of settings.
 * Results are newest-first, limited to `limit` (default 500, max 1000).
 */
export const getAllFacilityEvents = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string; limit?: number; before?: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);
    const limit = Math.min(Math.max(1, data.limit ?? 500), 1000);

    const conditions = [eq(schema.facilityEvent.facilityId, data.facilityId)];

    if (data.before) {
      conditions.push(lt(schema.facilityEvent.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select()
      .from(schema.facilityEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.facilityEvent.createdAt))
      .limit(limit);

    return attachEventAttachments(db, rows.map(toRow));
  });
