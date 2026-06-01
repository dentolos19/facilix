import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CanvasLayoutData } from "#/routes/(platform)/facility.$id/-helpers/types";

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
  data: text("data", { mode: "json" }).$type<Record<string, string | number>>().notNull(),
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
  data: text("data", { mode: "json" }).$type<Record<string, string | number>>().notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$default(() => new Date())
    .$onUpdate(() => new Date()),
});

export const deviceEvent = sqliteTable("device_logs", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  deviceId: text("device_id")
    .notNull()
    .references(() => facilityDevice.id, { onDelete: "cascade" }),
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
 * The actual binary is in the R2 bucket under the `r2Key` path.
 */
export const monitorRecording = sqliteTable("monitor_recordings", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  facilityId: text("facility_id")
    .notNull()
    .references(() => facility.id, { onDelete: "cascade" }),
  deviceId: text("device_id")
    .notNull()
    .references(() => facilityDevice.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  durationSec: integer("duration_sec"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
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
export type DeviceEvent = typeof deviceEvent.$inferSelect;
export type MonitorRecording = typeof monitorRecording.$inferSelect;
