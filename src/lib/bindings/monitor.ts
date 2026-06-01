import { Container } from "@cloudflare/containers";

const PORT = 3001;

export class Monitor extends Container<Env> {
  defaultPort = PORT;
  sleepAfter = "10m";
  envVars = Object.fromEntries(
    Object.entries(this.env).filter(([, value]) => typeof value === "string" && !!value),
  ) as Record<string, string>;
}
