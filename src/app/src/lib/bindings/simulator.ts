import { Container } from "@cloudflare/containers";

const ID = "singleton";
const PORT = 8000;

export class Simulator extends Container<Env> {
  defaultPort = PORT;
  pingEndpoint = "simulator/health/live";
  requiredPorts = [PORT];
  sleepAfter = "10m";
}

export function getSimulator(env: Env) {
  return env.SIMULATOR.getByName(ID);
}

export async function ensureSimulator(env: Env) {
  const simulator = getSimulator(env);
  await simulator.startAndWaitForPorts({
    ports: [PORT],
  });
  return simulator;
}

export async function routeSimulator(request: Request, env: Env) {
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
    return Response.json(
      { error: "Simulator controls are not publicly accessible" },
      { headers: { Allow: "GET, HEAD, OPTIONS" }, status: 405 },
    );
  }

  const url = new URL(request.url);
  url.pathname = url.pathname.slice("/simulator".length) || "/";

  const simulator = await ensureSimulator(env);
  return simulator.fetch(new Request(url, request));
}
