import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "lib/database/schema.ts",
  out: "migrations",
  dialect: "sqlite",
});
