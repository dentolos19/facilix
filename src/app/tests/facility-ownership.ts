import { Database } from "bun:sqlite";
import { beforeEach, expect, mock, test } from "bun:test";

import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "../src/lib/database/schema";

const sqlite = new Database(":memory:");
sqlite.exec(`
  CREATE TABLE facilities (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE facility_members (facility_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE facility_zones (id TEXT PRIMARY KEY, facility_id TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE facility_devices (id TEXT PRIMARY KEY, facility_id TEXT NOT NULL, zone_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
`);
const db = drizzle(sqlite, {
  schema,
  logger: {
    logQuery(_query, params) {
      if (params.length > 100) throw new Error("D1 supports at most 100 bound parameters");
    },
  },
});

mock.module("cloudflare:workers", () => ({ env: { DATABASE: {} } }));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (data: unknown) => unknown) => ({
      handler:
        (handle: (args: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handle({ data: validate(data) }),
    }),
  }),
}));
mock.module("#/lib/database", () => ({ createDatabase: () => db, schema }));
mock.module("#/lib/functions/access", () => ({
  getAccessContext: async () => ({}),
  requireAccessContext: async () => ({ userId: "user" }),
  requireFacilityAccess: async () => {},
}));

const { createFacility, saveFacility } = await import("../src/lib/functions/facility");

const zone = { id: "our-zone", name: "Our zone", data: {}, notes: "" };
const device = {
  id: "our-device",
  zoneId: zone.id,
  name: "Our device",
  type: "Sensor" as const,
  status: "online",
  data: {},
  notes: "",
};
const input = () => ({
  facilityId: "ours",
  name: "Edited",
  canvasData: { version: 1 as const, items: [] },
  zones: [zone],
  devices: [device],
});

beforeEach(() => {
  sqlite.exec(
    "DELETE FROM facility_devices; DELETE FROM facility_zones; DELETE FROM facility_members; DELETE FROM facilities;",
  );
  const insertFacility = sqlite.prepare("INSERT INTO facilities VALUES (?, ?, ?, '{}', 0, 0)");
  insertFacility.run(
    "ours",
    "Our facility",
    JSON.stringify({ version: 1, items: [], analyticsFeedGrid: { version: 1, layouts: { lg: [] } } }),
  );
  insertFacility.run("theirs", "Their facility", JSON.stringify({ version: 1, items: [] }));
  sqlite.exec(`
    INSERT INTO facility_zones VALUES ('our-zone', 'ours', 'Our zone', '{}', '', 0, 0), ('their-zone', 'theirs', 'Their zone', '{}', '', 0, 0);
    INSERT INTO facility_devices VALUES ('our-device', 'ours', 'our-zone', 'Our device', 'Sensor', 'online', '{}', '', 0, 0), ('their-device', 'theirs', 'their-zone', 'Their device', 'Sensor', 'online', '{}', '', 0, 0);
  `);
});

test("rejects foreign device IDs before modifying either facility", async () => {
  const request = input();
  request.devices = [{ ...device, id: "their-device" }];
  await expect(saveFacility({ data: request })).rejects.toThrow("another facility");
  expect(sqlite.query("SELECT name FROM facilities WHERE id = 'ours'").get()).toEqual({ name: "Our facility" });
  expect(sqlite.query("SELECT name FROM facility_devices WHERE id = 'their-device'").get()).toEqual({
    name: "Their device",
  });
  expect(sqlite.query("SELECT name FROM facility_devices WHERE id = 'our-device'").get()).toEqual({
    name: "Our device",
  });
});

test("new facilities receive their own item IDs and cannot link to a foreign zone", async () => {
  const created = await createFacility({
    data: {
      name: "New facility",
      initialItems: [
        {
          id: "their-device",
          type: "Sensor",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          zoneId: "their-zone",
          name: "Sensor",
          status: "online",
          notes: "",
          props: {},
        },
      ],
    },
  });
  const row = sqlite
    .query<{ id: string; zone_id: string | null }, [string]>(
      "SELECT id, zone_id FROM facility_devices WHERE facility_id = ?",
    )
    .get(created.id);
  expect(row?.id).not.toBe("their-device");
  expect(row?.zone_id).toBeNull();
  expect(sqlite.query("SELECT name FROM facility_devices WHERE id = 'their-device'").get()).toEqual({
    name: "Their device",
  });
});

test("rejects foreign zones and invalid links before any save", async () => {
  const request = input();
  request.zones = [{ ...zone, id: "their-zone" }];
  request.devices = [{ ...device, zoneId: "their-zone" }];
  await expect(saveFacility({ data: request })).rejects.toThrow("another facility");
  request.zones = [];
  await expect(saveFacility({ data: request })).rejects.toThrow("outside this layout");
  expect(sqlite.query("SELECT name FROM facility_zones WHERE id = 'their-zone'").get()).toEqual({ name: "Their zone" });
  expect(sqlite.query("SELECT name FROM facilities WHERE id = 'ours'").get()).toEqual({ name: "Our facility" });
});

test("checks large layouts without exceeding D1's parameter limit", async () => {
  const request = input();
  request.zones = Array.from({ length: 120 }, (_, index) => ({ ...zone, id: `zone-${index}` }));
  request.zones.push({ ...zone, id: "their-zone" });
  request.devices = [];
  await expect(saveFacility({ data: request })).rejects.toThrow("another facility");
  expect(sqlite.query("SELECT name FROM facilities WHERE id = 'ours'").get()).toEqual({ name: "Our facility" });
});

test("saves owned rows and retains feed settings", async () => {
  const request = input();
  request.devices = [{ ...device, name: "Updated" }];
  await saveFacility({ data: request });
  expect(sqlite.query("SELECT name FROM facility_devices WHERE id = 'our-device'").get()).toEqual({ name: "Updated" });
  const row = sqlite.query<{ data: string }, []>("SELECT data FROM facilities WHERE id = 'ours'").get();
  expect(row && JSON.parse(row.data).analyticsFeedGrid.layouts).toEqual({ lg: [] });
});
