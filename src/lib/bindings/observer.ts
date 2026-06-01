import { DurableObject } from "cloudflare:workers";

interface Observation {
  id: string;
  deviceId: string;
  type: string;
  data: string;
  createdAt: string;
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
 *   await stub.recordObservation("obs-001", "device-abc", "motion", '{"zone":"A"}');
 *   const recent = stub.queryObservations("device-abc");
 */
export class Observer extends DurableObject<Env> {
  private lastCleanup = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // blockConcurrencyWhile ensures the table exists before any request is
    // delivered — use it for one-time setup only, never for per-request work.
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS observations (
          id          TEXT PRIMARY KEY,
          device_id   TEXT NOT NULL,
          type        TEXT NOT NULL,
          data        TEXT NOT NULL DEFAULT '{}',
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_observations_device_id
        ON observations(device_id)
      `);

      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_observations_type
        ON observations(type)
      `);

      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_observations_created_at
        ON observations(created_at)
      `);
    });
  }

  // ── RPC Methods ─────────────────────────────────────────────────────

  /**
   * Record a new observation for a device.
   * Schedules a cleanup alarm on the first observation so old data doesn't
   * accumulate indefinitely.
   */
  async recordObservation(id: string, deviceId: string, type: string, data: string): Promise<{ success: boolean }> {
    const now = new Date().toISOString();

    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO observations (id, device_id, type, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      deviceId,
      type,
      data,
      now,
    );

    // Schedule a cleanup alarm if one isn't pending
    if (this.lastCleanup === 0) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      this.lastCleanup = Date.now();
    }

    return { success: true };
  }

  /**
   * Query observations, optionally filtered by device and/or type
   * within a time window. Results are newest-first.
   */
  queryObservations(deviceId?: string, type?: string, since?: string, limit: number = 100): Observation[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (deviceId) {
      conditions.push("device_id = ?");
      params.push(deviceId);
    }

    if (type) {
      conditions.push("type = ?");
      params.push(type);
    }

    if (since) {
      conditions.push("created_at >= ?");
      params.push(since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const results = this.ctx.storage.sql.exec<{
      id: string;
      device_id: string;
      type: string;
      data: string;
      created_at: string;
    }>(
      `SELECT id, device_id, type, data, created_at
       FROM observations
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      ...params,
      limit,
    );

    return results.toArray().map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      type: row.type,
      data: row.data,
      createdAt: row.created_at,
    }));
  }

  /** Return a summary of observation counts grouped by type. */
  getSummary(): Record<string, number> {
    const results = this.ctx.storage.sql.exec<{
      type: string;
      count: number;
    }>("SELECT type, COUNT(*) AS count FROM observations GROUP BY type");

    return Object.fromEntries(results.toArray().map((r) => [r.type, r.count]));
  }

  // ── Alarms ───────────────────────────────────────────────────────────

  /**
   * Alarm handler — runs on the schedule set by `recordObservation`.
   *
   * Purges observations older than 24 hours, then reschedules itself for the
   * next hour. If no data remains, the alarm chain stops automatically.
   */
  async alarm(): Promise<void> {
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();

    this.ctx.storage.sql.exec("DELETE FROM observations WHERE created_at < ?", cutoff);

    const remaining = this.ctx.storage.sql.exec<{ cnt: number }>("SELECT COUNT(*) AS cnt FROM observations");

    if (remaining.one().cnt > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 3_600_000);
    } else {
      this.lastCleanup = 0;
    }
  }
}
