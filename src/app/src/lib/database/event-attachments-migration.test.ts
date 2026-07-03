import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";

const legacyAttachmentMigration = await Bun.file(
  new URL("../../../migrations/0012_event_media.sql", import.meta.url),
).text();
const eventAttachmentsMigration = await Bun.file(
  new URL("../../../migrations/0013_event_attachments.sql", import.meta.url),
).text();

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
    CREATE TABLE prediction_outputs (
      id TEXT PRIMARY KEY NOT NULL,
      after_asset_id TEXT NOT NULL,
      segment_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      frame_index INTEGER NOT NULL,
      at_sec REAL NOT NULL,
      predictions TEXT NOT NULL
    );
  `);
  return db;
}

function applyAttachmentMigrations(database: Database) {
  database.exec(legacyAttachmentMigration);
  database.exec(eventAttachmentsMigration);
}

describe("event attachments migrations", () => {
  test("renames event_media and backfills source clips plus annotated predictions", () => {
    const database = createBaseDatabase();
    database.exec(`
      INSERT INTO assets VALUES ('clip-1', 'clip.webm', 'video/webm', 100, 'hash', 1, 1);
      INSERT INTO assets VALUES ('annotated-1', 'frame.jpg', 'image/jpeg', 50, 'hash', 1, 1);
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
      INSERT INTO prediction_outputs VALUES (
        'output-1',
        'annotated-1',
        'segment-1',
        'restricted-area-protection',
        30,
        1.0,
        '[{"label":"person","confidence":0.92}]'
      );
    `);
    applyAttachmentMigrations(database);

    const attachments = database
      .query("SELECT event_id, asset_id, kind, variant, role, sort_order FROM event_attachments ORDER BY sort_order")
      .all();
    expect(attachments).toEqual([
      {
        event_id: "event-1",
        asset_id: "annotated-1",
        kind: "image",
        variant: "annotated-frame",
        role: "primary",
        sort_order: 0,
      },
      {
        event_id: "event-1",
        asset_id: "clip-1",
        kind: "video",
        variant: "source-segment",
        role: "source",
        sort_order: 3,
      },
    ]);
    expect(
      database.query("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'event_media'").get(),
    ).toEqual({ count: 0 });
    expect(() =>
      database
        .query(`
          INSERT INTO event_attachments VALUES (
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
    applyAttachmentMigrations(database);
    database.exec(`
      INSERT INTO assets VALUES ('clip-1', 'clip.webm', 'video/webm', 100, 'hash', 1, 1);
      INSERT INTO facility_events VALUES (
        'event-1', 'facility-1', 'device-1', 'warn', 'manual', 'Alert', '{}', 1, 1
      );
      INSERT INTO event_attachments VALUES (
        'attachment-1', 'event-1', 'clip-1', 'video', 'source-segment', 'primary', 0, '{}', 1
      );
      DELETE FROM facility_events WHERE id = 'event-1';
    `);
    expect(database.query("SELECT count(*) AS count FROM event_attachments").get()).toEqual({ count: 0 });
    expect(database.query("SELECT count(*) AS count FROM assets").get()).toEqual({ count: 1 });

    database.exec(`
      INSERT INTO facility_events VALUES (
        'event-2', 'facility-1', 'device-1', 'warn', 'manual', 'Alert', '{}', 1, 1
      );
      INSERT INTO event_attachments VALUES (
        'attachment-2', 'event-2', 'clip-1', 'video', 'source-segment', 'primary', 0, '{}', 1
      );
      DELETE FROM assets WHERE id = 'clip-1';
    `);
    expect(database.query("SELECT count(*) AS count FROM event_attachments").get()).toEqual({ count: 0 });
    expect(database.query("SELECT count(*) AS count FROM facility_events").get()).toEqual({ count: 1 });
  });
});
