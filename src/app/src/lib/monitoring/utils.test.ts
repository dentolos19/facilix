import { describe, expect, test } from "bun:test";

import type { createDatabase } from "#/lib/database";
import { schema } from "#/lib/database";

import { recordEvent } from "./utils";

interface InsertCapture {
  table: unknown;
  values: unknown;
}

function createDatabaseDouble({ failMedia = false }: { failMedia?: boolean } = {}) {
  const inserts: InsertCapture[] = [];
  const db = {
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });
          if (table === schema.eventMedia) {
            return {
              onConflictDoNothing: async () => {
                if (failMedia) throw new Error("stale asset");
              },
            };
          }
          return Promise.resolve();
        },
      };
    },
  } as unknown as ReturnType<typeof createDatabase>;

  return { db, inserts };
}

function createObserverDouble() {
  const broadcasts: Array<{ deviceId: string; type: string; data: string }> = [];
  const observer = {
    async recordEvent(deviceId: string, type: string, data: string) {
      broadcasts.push({ deviceId, type, data });
      return { success: true };
    },
  } as unknown as Parameters<typeof recordEvent>[1];
  return { observer, broadcasts };
}

describe("recordEvent", () => {
  test("returns the persisted event ID and associates ordered media", async () => {
    const { db, inserts } = createDatabaseDouble();
    const { observer, broadcasts } = createObserverDouble();

    const eventId = await recordEvent(
      db,
      observer,
      "facility-1",
      "device-1",
      "cctv:detection:alert",
      "warn",
      "Restricted area entry",
      { count: 1 },
      [
        {
          assetId: "image-1",
          kind: "image",
          variant: "annotated-frame",
          role: "primary",
          metadata: { frameIndex: 30 },
        },
        {
          assetId: "video-1",
          kind: "video",
          variant: "source-segment",
          role: "source",
        },
      ],
    );

    expect(eventId).toBeString();
    if (!eventId) throw new Error("Expected the event to persist");
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.table).toBe(schema.facilityEvent);
    expect(inserts[1]?.table).toBe(schema.eventMedia);
    const eventValues = inserts[0]?.values as { id: string };
    const mediaValues = inserts[1]?.values as Array<{ eventId: string; assetId: string; sortOrder: number }>;
    expect(eventValues.id).toBe(eventId);
    expect(mediaValues).toEqual([
      expect.objectContaining({ eventId, assetId: "image-1", sortOrder: 0 }),
      expect.objectContaining({ eventId, assetId: "video-1", sortOrder: 1 }),
    ]);
    expect(broadcasts).toHaveLength(1);
  });

  test("keeps the event when optional media association fails", async () => {
    const { db, inserts } = createDatabaseDouble({ failMedia: true });
    const { observer, broadcasts } = createObserverDouble();

    const eventId = await recordEvent(
      db,
      observer,
      "facility-1",
      null,
      "cctv:detection:alert",
      "warn",
      "Alert without durable evidence",
      {},
      [{ assetId: "missing", kind: "video", variant: "source-segment" }],
    );

    expect(eventId).toBeString();
    expect(inserts[0]?.table).toBe(schema.facilityEvent);
    expect(broadcasts).toHaveLength(1);
  });
});
