import { Container } from "@cloudflare/containers";
import { eq } from "drizzle-orm";
import { createDatabase, schema } from "#/lib/database";
import { type LogSeverity, normalizeFacilitySettings, shouldShowInGlobalEvents } from "#/lib/monitoring/logs";

const PORT = 3001;

export class Server extends Container<Env> {
  defaultPort = PORT;
  sleepAfter = "10m";

  /** The facility ID this container was instantiated for. */
  private get facilityId(): string {
    return this.ctx.id.name();
  }

  /** Record a lifecycle event to the DO observations table and, if important, to D1 facility_events. */
  private async recordEvent(type: string, extra: Record<string, unknown> = {}): Promise<void> {
    const { level = "info", message } = extra as { level?: string; message?: string };
    const severity = (level === "warn" || level === "error" ? level : "info") as LogSeverity;

    // 1. Always write to DO observations for Container Logs
    try {
      const stub = this.env.OBSERVER.getByName(this.facilityId);
      await stub.recordEvent(
        this.facilityId,
        type,
        JSON.stringify({ facilityId: this.facilityId, source: "monitoring-do", ...extra }),
      );
    } catch {
      // Observer recording is best-effort; don't block container start/stop.
    }

    // 2. Persist lifecycle events to D1 facility_events
    try {
      const db = createDatabase(this.env.DATABASE);
      const [facRow] = await db
        .select({ settings: schema.facility.settings })
        .from(schema.facility)
        .where(eq(schema.facility.id, this.facilityId))
        .limit(1);
      const settings = normalizeFacilitySettings(facRow?.settings ?? undefined);

      if (!shouldShowInGlobalEvents(type, severity, settings)) {
        return;
      }

      const now = new Date();
      await db.insert(schema.facilityEvent).values({
        id: crypto.randomUUID(),
        facilityId: this.facilityId,
        deviceId: null,
        severity,
        type,
        message: (message as string) ?? type,
        data: extra,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // D1 recording is best-effort; don't block container start/stop.
    }
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────

  async onStart(): Promise<void> {
    await this.recordEvent("monitoring:started", { level: "info", message: "Monitoring container started" });
  }

  async onStop(params: { exitCode?: number; reason?: string }): Promise<void> {
    await this.recordEvent("monitoring:stopped", {
      level: "info",
      message: "Monitoring container stopped",
      exitCode: params.exitCode,
      reason: params.reason,
    });
  }
}
