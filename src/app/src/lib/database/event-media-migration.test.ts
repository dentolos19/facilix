import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";

const migration = await Bun.file(new URL("../../../migrations/0012_event_media.sql", import.meta.url)).text();

let db: Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function createBaseDatabase() {
  db = new Database(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE assets (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE facility_events (
      id TEXT PRIMARY KEY NOT NULL,
      facility_id TEXT NOT NULL,
      device_id TEXT,
      severity TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe("0012 event media migration", () => {
  test("backfills valid source clips and enforces attachment uniqueness", () => {
    const database = createBaseDatabase();
    database.exec(`
      INSERT INTO assets VALUES ('clip-1', 'clip.webm', 'video/webm', 100, 'hash', 1, 1);
      INSERT INTO facility_events VALUES (
        'event-1',
        'facility-1',
        'device-1',
        'warn',
        'cctv:detection:alert',
        'Alert',
        '{"assetId":"clip-1","segmentId":"segment-1","pluginId":"restricted-area-protection"}',
        1,
        1
      );
    `);
    database.exec(migration);

    const attachment = database
      .query("SELECT event_id, asset_id, kind, variant, role FROM event_media")
      .get() as Record<string, string>;
    expect(attachment).toEqual({
      event_id: "event-1",
      asset_id: "clip-1",
      kind: "video",
      variant: "source-segment",
      role: "primary",
    });
    expect(() =>
      database
        .query(`
          INSERT INTO event_media VALUES (
            'duplicate',
            'event-1',
            'clip-1',
            'video',
            'source-segment',
            'supporting',
            1,
            '{}',
            1
          )
        `)
        .run(),
    ).toThrow();
  });

  test("cascades attachments from event and asset deletion without coupling their lifetimes", () => {
    const database = createBaseDatabase();
    database.exec(migration);
    database.exec(`
      INSERT INTO assets VALUES ('clip-1', 'clip.webm', 'video/webm', 100, 'hash', 1, 1);
      INSERT INTO facility_events VALUES (
        'event-1', 'facility-1', 'device-1', 'warn', 'manual', 'Alert', '{}', 1, 1
      );
      INSERT INTO event_media VALUES (
        'media-1', 'event-1', 'clip-1', 'video', 'source-segment', 'primary', 0, '{}', 1
      );
      DELETE FROM facility_events WHERE id = 'event-1';
    `);
    expect(database.query("SELECT count(*) AS count FROM event_media").get()).toEqual({ count: 0 });
    expect(database.query("SELECT count(*) AS count FROM assets").get()).toEqual({ count: 1 });

    database.exec(`
      INSERT INTO facility_events VALUES (
        'event-2', 'facility-1', 'device-1', 'warn', 'manual', 'Alert', '{}', 1, 1
      );
      INSERT INTO event_media VALUES (
        'media-2', 'event-2', 'clip-1', 'video', 'source-segment', 'primary', 0, '{}', 1
      );
      DELETE FROM assets WHERE id = 'clip-1';
    `);
    expect(database.query("SELECT count(*) AS count FROM event_media").get()).toEqual({ count: 0 });
    expect(database.query("SELECT count(*) AS count FROM facility_events").get()).toEqual({ count: 1 });
  });
});
