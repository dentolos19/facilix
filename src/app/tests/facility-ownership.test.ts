import { test } from "bun:test";
import { fileURLToPath } from "node:url";

test("facility writes enforce ownership", async () => {
  // Module mocks must stay in a separate process so they cannot affect other tests.
  const fixture = fileURLToPath(new URL("./facility-ownership.ts", import.meta.url));
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const child = Bun.spawn([process.execPath, "test", fixture], { cwd, stdout: "ignore", stderr: "pipe" });
  const [exitCode, output] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (exitCode !== 0) throw new Error(output);
});
