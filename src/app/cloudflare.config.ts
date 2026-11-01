import { bindings, defineConfig, defineContainer, defineWorker, exports } from "cf/config";

import * as entrypoint from "./src/server.ts" with { type: "cf-worker" };

const workerName = "facilix";

const server = defineContainer({
  name: `${workerName}-server`,
  image: { dockerfile: "../server/Dockerfile" },
  instanceType: "basic",
  maxInstances: 5,
});

const simulator = defineContainer({
  name: `${workerName}-simulator`,
  image: { dockerfile: "../simulator/Dockerfile" },
  instanceType: "standard-1",
  maxInstances: 1,
});

const worker = defineWorker({
  name: workerName,
  compatibilityDate: "2026-10-01",
  entrypoint,
  exports: {
    Server: exports.durableObject({ storage: "sqlite", container: server }),
    Observer: exports.durableObject({ storage: "sqlite" }),
    Simulator: exports.durableObject({ storage: "sqlite", container: simulator }),
    Processor: exports.workflow({ name: `${workerName}-processor` }),
  },
});

export default defineConfig({
  accountId: "d910f54eba4cf3d1634aa41c3d9a93bc",
  containers: [server, simulator],
  worker: {
    ...worker,
    observability: {
      logs: { enabled: true },
      traces: { enabled: true },
      issues: { enabled: true },
    },
    domains: ["facilix.dennise.me"],
    env: {
      BETTER_AUTH_SECRET: bindings.secret(),
      BETTER_AUTH_URL: bindings.secret(),
      OPENROUTER_API_KEY: bindings.secret(),
      OPENROUTER_MODEL: bindings.secret(),
      OPENROUTER_REFERER: bindings.secret(),
      OPENROUTER_TITLE: bindings.secret(),
      ROBOFLOW_API_KEY: bindings.secret(),
      VISION_OBJECT_MODEL: bindings.secret(),
      VISION_VEHICLE_MODEL: bindings.secret(),
      DATABASE: bindings.d1({ id: "8d175dfa-86d8-46a5-8ab9-405e959dc896", name: workerName }),
      BUCKET: bindings.r2({ name: workerName }),
      SERVER: bindings.durableObject<typeof worker, "Server">({ worker, exportName: "Server" }),
      OBSERVER: bindings.durableObject<typeof worker, "Observer">({ worker, exportName: "Observer" }),
      SIMULATOR: bindings.durableObject<typeof worker, "Simulator">({ worker, exportName: "Simulator" }),
      PROCESSOR: bindings.workflow<typeof worker, "Processor">({
        name: `${workerName}-processor`,
        worker,
        exportName: "Processor",
      }),
    },
  },
});
