import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
  settings: text("settings", { mode: "json" }).$type<FacilitySettings>().default("{}").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

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
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

/**
 * Recorded CCTV segment metadata stored in D1 alongside R2.
 * The actual binary is in the R2 bucket — the `assetId` column
 * references the `assets` table which holds storage metadata.
 */
export const videoRecording = sqliteTable("video_recordings", {
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
 * Idempotency tracking for monitoring API (frame/segment uploads).
 * Prevents duplicate processing on network retry.
 */
export const idempotencyKey = sqliteTable("idempotency_keys", {
  id: text("id").primaryKey(), // the idempotency key value itself
  facilityId: text("facility_id").notNull(),
  deviceId: text("device_id").notNull(),
  action: text("action").notNull(), // "frame" | "segment"
  result: text("result", { mode: "json" }).$type<string>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type Asset = typeof asset.$inferSelect;
export type Facility = typeof facility.$inferSelect;
export type FacilityDevice = typeof facilityDevice.$inferSelect;
export type FacilityEvent = typeof facilityEvent.$inferSelect;
export type VideoRecording = typeof videoRecording.$inferSelect;
export type SensorReading = typeof sensorReading.$inferSelect;
export type IdempotencyKey = typeof idempotencyKey.$inferSelect;
