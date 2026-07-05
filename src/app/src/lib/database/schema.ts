import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type { FacilitySettings } from "#/lib/monitoring/logs";
import type { CanvasLayoutData, JsonObject } from "#/routes/(platform)/facility.$id/-helpers/types";

export const asset = sqliteTable("assets", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  hash: text("hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const user = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  role: text("role", { enum: ["user", "admin"] })
    .notNull()
    .default("user"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const session = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const verification = sqliteTable("verifications", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const facility = sqliteTable("facilities", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  name: text("name").notNull(),
  data: text("data", { mode: "json" }).$type<CanvasLayoutData>().notNull(),
  settings: text("settings", { mode: "json" })
    .$type<FacilitySettings>()
    .default(sql`'{}'`)
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const facilityMember = sqliteTable(
  "facility_members",
  {
    facilityId: text("facility_id")
      .notNull()
      .references(() => facility.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [uniqueIndex("facility_members_facility_user_idx").on(table.facilityId, table.userId)],
);

export const facilityZone = sqliteTable("facility_zones", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  facilityId: text("facility_id")
    .notNull()
    .references(() => facility.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  data: text("data", { mode: "json" }).$type<JsonObject>().notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const facilityDevice = sqliteTable("facility_devices", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  facilityId: text("facility_id")
    .notNull()
    .references(() => facility.id, { onDelete: "cascade" }),
  zoneId: text("zone_id").references(() => facilityZone.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  data: text("data", { mode: "json" }).$type<JsonObject>().notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const facilityEvent = sqliteTable("facility_events", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  facilityId: text("facility_id")
    .notNull()
    .references(() => facility.id, { onDelete: "cascade" }),
  deviceId: text("device_id").references(() => facilityDevice.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  data: text("data", { mode: "json" }).$type<JsonObject>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

/**
 * Evidence attachments linked to a facility event.
 *
 * Assets are shared with recordings and prediction outputs. Deleting an event
 * removes only the relation; deleting a source asset removes the attachment.
 */
export const eventAttachment = sqliteTable(
  "event_attachments",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    eventId: text("event_id")
      .notNull()
      .references(() => facilityEvent.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    variant: text("variant").notNull(),
    role: text("role").notNull().default("supporting"),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: text("metadata", { mode: "json" }).$type<JsonObject>().default({}).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    index("event_attachments_event_id_idx").on(table.eventId),
    index("event_attachments_asset_id_idx").on(table.assetId),
    uniqueIndex("event_attachments_event_asset_variant_idx").on(table.eventId, table.assetId, table.variant),
  ],
);

/**
 * Recorded CCTV video segment metadata stored in D1 alongside R2.
 * The actual binary is in the R2 bucket — the `assetId` column
 * references the `assets` table which holds storage metadata.
 */
export const videoSegment = sqliteTable("video_segments", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  assetId: text("asset_id")
    .notNull()
    .references(() => asset.id, { onDelete: "cascade" }),
  facilityId: text("facility_id")
    .notNull()
    .references(() => facility.id, { onDelete: "cascade" }),
  deviceId: text("device_id")
    .notNull()
    .references(() => facilityDevice.id, { onDelete: "cascade" }),
  data: text("data", { mode: "json" }).default("{}").$type<Record<string, unknown>>().notNull(),
  durationSec: integer("duration_sec"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
});

/**
 * Sensor readings persisted for history and latest-value queries.
 * Each reading from the monitoring container gets a row here.
 */
export const sensorReading = sqliteTable("sensor_readings", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  facilityId: text("facility_id")
    .notNull()
    .references(() => facility.id, { onDelete: "cascade" }),
  deviceId: text("device_id")
    .notNull()
    .references(() => facilityDevice.id, { onDelete: "cascade" }),
  sensorType: text("sensor_type").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  status: text("status").notNull().default("ok"),
  secondaryValue: real("secondary_value"),
  secondaryUnit: text("secondary_unit"),
  batteryPct: real("battery_pct"),
  signalRssiDbm: integer("signal_rssi_dbm"),
  source: text("source").notNull().default("simulation"),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
});

/**
 * Idempotency tracking for monitoring API (segment uploads).
 * Prevents duplicate processing on network retry.
 */
export const idempotencyKey = sqliteTable("idempotency_keys", {
  id: text("id").primaryKey(), // the idempotency key value itself
  facilityId: text("facility_id").notNull(),
  deviceId: text("device_id").notNull(),
  action: text("action").notNull(), // "segment"
  result: text("result", { mode: "json" }).$type<string>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
});

/**
 * Roboflow workflow prediction outputs stored per sampled frame.
 * Each row stores the raw frame image (before) and annotated frame (after)
 * with bounding boxes drawn, plus the predictions JSON.
 */
export const predictionOutput = sqliteTable(
  "prediction_outputs",
  {
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),
    beforeAssetId: text("before_asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    afterAssetId: text("after_asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    segmentId: text("segment_id")
      .notNull()
      .references(() => videoSegment.id, { onDelete: "cascade" }),
    facilityId: text("facility_id")
      .notNull()
      .references(() => facility.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => facilityDevice.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id").notNull(),
    workflowId: text("workflow_id").notNull(),
    outputName: text("output_name").notNull(),
    frameIndex: integer("frame_index").notNull(),
    atSec: real("at_sec").notNull(),
    predictions: text("predictions", { mode: "json" }).$type<Record<string, unknown>[]>().notNull(),
    image: text("image", { mode: "json" }).$type<{ width: number; height: number }>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => [
    index("prediction_outputs_segment_id_idx").on(table.segmentId),
    index("prediction_outputs_facility_id_idx").on(table.facilityId),
    index("prediction_outputs_device_id_idx").on(table.deviceId),
    uniqueIndex("prediction_outputs_idempotency_idx").on(
      table.segmentId,
      table.pluginId,
      table.workflowId,
      table.outputName,
      table.frameIndex,
    ),
  ],
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type Asset = typeof asset.$inferSelect;
export type Facility = typeof facility.$inferSelect;
export type FacilityMember = typeof facilityMember.$inferSelect;
export type FacilityDevice = typeof facilityDevice.$inferSelect;
export type FacilityEvent = typeof facilityEvent.$inferSelect;
export type EventAttachment = typeof eventAttachment.$inferSelect;
export type VideoSegment = typeof videoSegment.$inferSelect;
export type SensorReading = typeof sensorReading.$inferSelect;
export type IdempotencyKey = typeof idempotencyKey.$inferSelect;
export type PredictionOutput = typeof predictionOutput.$inferSelect;
