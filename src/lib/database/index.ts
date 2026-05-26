import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { schema };

/**
 * Create a Drizzle ORM instance bound to a Cloudflare D1 database.
 *
 * Usage in a TanStack Start server route or loader:
 *
 * ```ts
 * import { createDb } from "#/db";
 * import { users } from "#/db/schema";
 *
 * export async function loader({ context }: LoaderFunctionArgs) {
 *   const db = createDb(context.cloudflare.env.facilix_db);
 *   const allUsers = await db.select().from(users);
 *   return { users: allUsers };
 * }
 * ```
 */
export function createDb(binding: D1Database) {
  return drizzle(binding, { schema });
}
