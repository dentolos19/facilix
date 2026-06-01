import { Container } from "@cloudflare/containers";

const PORT = 3001;

export class Monitor extends Container<Env> {
  defaultPort = PORT;
  sleepAfter = "10m";
  envVars = Object.fromEntries(
    Object.entries(this.env).filter(([, value]) => typeof value === "string" && !!value),
  ) as Record<string, string>;

  /** The facility ID this container was instantiated for. */
  private get facilityId(): string {
    return this.ctx.id.name();
  }

  /** Record a lifecycle event in the per-facility Observer. */
  private async recordEvent(type: string): Promise<void> {
    try {
      const stub = this.env.OBSERVER.getByName(this.facilityId);
      await stub.recordEvent(this.facilityId, type, JSON.stringify({ facilityId: this.facilityId }));
    } catch {
      // Observer recording is best-effort; don't block container start/stop.
    }
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────

  async onStart(): Promise<void> {
    await this.recordEvent("monitor:started");
  }

  async onStop(params: { exitCode?: number; reason?: string }): Promise<void> {
    await this.recordEvent("monitor:stopped");
  }
}
