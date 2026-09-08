export const SIMULATOR_PATH = "/simulator";

export function getContainerOrigin(url: string) {
  const origin = new URL(url);
  if (["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname)) {
    origin.hostname = "172.17.0.1";
  }
  return origin.origin;
}

export function getSimulatorBase() {
  return import.meta.env.VITE_SIMULATOR_URL ?? SIMULATOR_PATH;
}

export function getSimulatorUrl(appUrl: string) {
  return new URL(SIMULATOR_PATH, `${appUrl.replace(/\/$/, "")}/`).toString().replace(/\/$/, "");
}
