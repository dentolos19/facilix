import { DurableObject } from "cloudflare:workers";

interface ObserverEvent {
  id: string;
  type: string;
  source: string;
  payload: string;
  timestamp: number;
  acknowledged: boolean;
}

/**
 * Observer — A Durable Object for coordinating real-time event observation
 * across the Facilix platform.
 *
 * This is a sample DO demonstrating:
 *   - SQLite storage for persistent state (auto-created in constructor)
 *   - RPC methods for type-safe, direct communication from Workers
 *   - Alarms for periodic maintenance (automatic event cleanup)
 *   - Concurrency-safe initialization via `blockConcurrencyWhile`
 *
 * Usage (from a Worker fetch handler):
 *   const stub = env.OBSERVER.getByName("sensor-room-1");
 *   await stub.recordEvent("evt-001", "motion", "camera-3", '{"zone":"A"}');
 *   const events = stub.queryEvents("motion");
 */
export class Observer extends DurableObject<Env> {
  private lastCleanup = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // blockConcurrencyWhile ensures schema is created before any request is
    // delivered — use it for one-time setup only, never for per-request work.
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id          TEXT PRIMARY KEY,
          type        TEXT NOT NULL,
          source      TEXT NOT NULL,
          payload     TEXT NOT NULL DEFAULT '{}',
          timestamp   INTEGER NOT NULL,
          acknowledged INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT DEFAULT (datetime('now'))
        )
      `);

      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_events_type
        ON events(type)
      `);

      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_events_timestamp
        ON events(timestamp)
      `);
    });
  }

  // ── RPC Methods ─────────────────────────────────────────────────────

  /**
   * Record a new observation event.
   * Scheduling a cleanup alarm on the first event so old data doesn't
   * accumulate indefinitely.
   */
  async recordEvent(id: string, type: string, source: string, payload: string): Promise<{ success: boolean }> {
    const now = Date.now();

    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO events (id, type, source, payload, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      type,
      source,
      JSON.stringify(payload),
      now,
    );

    // Schedule an alarm for event cleanup if one isn't pending
    if (this.lastCleanup === 0) {
      await this.ctx.storage.setAlarm(now + 60_000); // 1 minute from now
      this.lastCleanup = now;
    }

    return { success: true };
  }

  /** Query recent events by type within an optional time window. */
  queryEvents(type: string, since?: number, limit: number = 100): ObserverEvent[] {
    const sinceMs = since ?? Date.now() - 3_600_000; // default: last hour

    const results = this.ctx.storage.sql.exec<ObserverEvent>(
      `SELECT id, type, source, payload, timestamp, acknowledged
       FROM events
       WHERE type = ? AND timestamp >= ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      type,
      sinceMs,
      limit,
    );

    return results.toArray().map((row) => ({
      id: row.id,
      type: row.type,
      source: row.source,
      payload: row.payload,
      timestamp: row.timestamp,
      acknowledged: row.acknowledged === 1,
    }));
  }

  /** Mark a single event as acknowledged. */
  async acknowledgeEvent(id: string): Promise<{ success: boolean }> {
    this.ctx.storage.sql.exec("UPDATE events SET acknowledged = 1 WHERE id = ?", id);
    return { success: true };
  }

  /** Return a summary of event counts grouped by type. */
  getSummary(): Record<string, number> {
    const results = this.ctx.storage.sql.exec<{
      type: string;
      count: number;
    }>("SELECT type, COUNT(*) AS count FROM events GROUP BY type");

    return Object.fromEntries(results.toArray().map((r) => [r.type, r.count]));
  }

  // ── Alarms ───────────────────────────────────────────────────────────

  /**
   * Alarm handler — runs on the schedule set by `recordEvent`.
   *
   * Purges events older than 24 hours, then reschedules itself for the next
   * hour. If there are no events left, the alarm chain stops automatically.
   */
  async alarm(): Promise<void> {
    const cutoff = Date.now() - 86_400_000; // 24 hours

    this.ctx.storage.sql.exec("DELETE FROM events WHERE timestamp < ?", cutoff);

    // Only keep the chain alive if there's data worth cleaning later
    const remaining = this.ctx.storage.sql.exec<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM events");

    if (remaining.one().cnt > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 3_600_000); // next hour
    } else {
      this.lastCleanup = 0;
    }
  }
}
