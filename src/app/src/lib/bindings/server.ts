import { Container } from "@cloudflare/containers";

const PORT = 3001;

export class Server extends Container<Env> {
  defaultPort = PORT;
  sleepAfter = "10m";

  /** The facility ID this container was instantiated for. */
  private get facilityId(): string {
    return this.ctx.id.name();
  }

  /** Record a lifecycle event with richer payload. */
  private async recordEvent(type: string, extra: Record<string, unknown> = {}): Promise<void> {
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
