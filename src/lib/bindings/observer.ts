import { DurableObject } from "cloudflare:workers";
import type { FacilityEvent, ObserverSocketMessage } from "#/lib/monitoring/types";

interface Observation {
  id: string;
  deviceId: string;
  type: string;
  data: string;
  createdAt: string;
}

function toEvent(row: {
  id: string;
  device_id: string;
  type: string;
  data: string;
  created_at: string;
}): FacilityEvent {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.type,
    data: row.data,
    createdAt: row.created_at,
  };
}

/**
 * Observer — A Durable Object for coordinating real-time event observation
 * across the Facilix platform.
 *
 * One instance per facility, keyed by facility ID.
 * Supports both RPC calls (from server functions) and WebSocket connections
 * (from browser clients).
 *
 * RPC (from server functions):
 *   const stub = env.OBSERVER.getByName(facilityId);
 *   await stub.recordEvent("device-abc", "monitoring:started", "{}");
 *   const events = stub.queryEvents("device-abc");
 *
 * WebSocket (from the browser):
 *   const ws = new WebSocket(`${location.origin}/api/facility/${id}/observer/ws`);
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

  // ── WebSocket handler (called via DO stub .fetch()) ────────────────

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade")?.toLowerCase();
    if (upgrade !== "websocket") {
      return new Response("Observer DO ready", { status: 200 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    // Send an initial snapshot of recent events
    const recent = this.queryEvents(undefined, undefined, 200);
    this.send(server, { type: "snapshot", events: recent });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Clients are read-only — we ignore incoming messages for now.
    // Future: could support subscription filters here.
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    // WebSocket cleanup is automatic — no manual bookkeeping needed.
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    // Errors are automatically handled — no-op.
  }

  // ── RPC Methods ─────────────────────────────────────────────────────

  /**
   * Record a new event and broadcast it to all connected WebSocket clients.
   * This is the primary method for recording events.
   */
  async recordEvent(deviceId: string, type: string, data: string): Promise<{ success: boolean }> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.ctx.storage.sql.exec(
      `INSERT INTO observations (id, device_id, type, data, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      deviceId,
      type,
      data,
      now,
    );

    const event: FacilityEvent = { id, deviceId, type, data, createdAt: now };

    // Broadcast to all connected WebSocket clients
    this.broadcast({ type: "event", event });

    // Schedule a cleanup alarm if one isn't pending
    if (this.lastCleanup === 0) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      this.lastCleanup = Date.now();
    }

    return { success: true };
  }

  /**
   * Record a new observation for a device (legacy API, also broadcasts).
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

    const event: FacilityEvent = { id, deviceId, type, data, createdAt: now };
    this.broadcast({ type: "event", event });

    // Schedule a cleanup alarm if one isn't pending
    if (this.lastCleanup === 0) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
      this.lastCleanup = Date.now();
    }

    return { success: true };
  }

  /**
   * Query events, optionally filtered by device and/or type
   * within a time window. Results are newest-first.
   */
  queryEvents(deviceId?: string, type?: string, limit: number = 100): FacilityEvent[] {
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

    return results.toArray().map(toEvent);
  }

  /**
   * Query observations, optionally filtered by device and/or type
   * within a time window. Results are newest-first.
   *
   * @deprecated Use `queryEvents` instead.
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

  // ── Internal helpers ───────────────────────────────────────────────

  /** Send a JSON message to a single WebSocket client. */
  private send(ws: WebSocket, msg: ObserverSocketMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Client disconnected — ignore.
    }
  }

  /** Broadcast a JSON message to every connected WebSocket client. */
  private broadcast(msg: ObserverSocketMessage): void {
    const sockets = this.ctx.getWebSockets();
    const payload = JSON.stringify(msg);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // Client disconnected — ignore.
      }
    }
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
