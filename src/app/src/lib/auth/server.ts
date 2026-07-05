import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createDatabase } from "#/lib/database";

export function createAuth(binding: D1Database) {
  const db = createDatabase(binding);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: ["user", "admin"],
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
