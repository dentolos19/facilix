import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CanvasLayoutData } from "#/lib/types";

export const asset = sqliteTable("assets", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  hash: text("hash").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export const user = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export const session = sqliteTable("sessions", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  expiresAt: text("expires_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  token: text("token").notNull().unique(),
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
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
  accessTokenExpiresAt: text("access_token_expires_at"),
  refreshTokenExpiresAt: text("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export const verification = sqliteTable("verifications", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: text("expires_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  createdAt: text("created_at").$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export const facility = sqliteTable("facilities", {
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),
  name: text("name").notNull(),
  data: text("data", { mode: "json" }).$type<CanvasLayoutData>().notNull(),
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
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
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
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
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export const deviceLog = sqliteTable("device_logs", {
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
  createdAt: text("created_at")
    .notNull()
    .$default(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$default(() => new Date().toISOString())
    .$onUpdate(() => new Date().toISOString()),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type Asset = typeof asset.$inferSelect;
export type Facility = typeof facility.$inferSelect;
export type FacilityDevice = typeof facilityDevice.$inferSelect;
export type DeviceLog = typeof deviceLog.$inferSelect;
