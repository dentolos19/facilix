import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadConfig } from "@cloudflare/config";

const { config: loaded } = await loadConfig(fileURLToPath(new URL("../cloudflare.config.ts", import.meta.url)));
const config = loaded as typeof import("../cloudflare.config.ts").default;

const [action, ...args] = process.argv.slice(2);
if (action !== "migrate") throw new Error("Expected migrate.");
if (args.includes("--remote") && args.includes("--local")) throw new Error("Choose --local or --remote.");

const command = ["d1", "migrations", "apply", config.worker.env.DATABASE.id!, "--dir", "migrations"];
if (!args.includes("--remote")) {
  command.push("--local");
  if (!args.some((arg) => arg === "--persist-to" || arg.startsWith("--persist-to=")))
    command.push("--persist-to", ".wrangler/state");
}
command.push(...args.filter((arg) => arg !== "--remote"));

const child = spawnSync(process.execPath, ["node_modules/cf/bin/cf", ...command], { stdio: "inherit" });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
