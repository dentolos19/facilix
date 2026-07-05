import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import { getSession } from "#/lib/auth/guard";
import { createDatabase, schema } from "#/lib/database";

export interface AccessContext {
  userId: string;
  isAdmin: boolean;
}

export async function getAccessContext(): Promise<AccessContext | null> {
  const request = getRequest();
  const session = await getSession(request, env.DATABASE);
  if (!session) return null;
  const isAdmin = session.user.role === "admin";
  return { userId: session.user.id, isAdmin };
}

export async function requireAccessContext(): Promise<AccessContext> {
  const ctx = await getAccessContext();
  if (!ctx) throw new Error("Unauthorized");
  return ctx;
}

export async function requireFacilityAccess(facilityId: string): Promise<AccessContext> {
  const ctx = await requireAccessContext();
  if (ctx.isAdmin) return ctx;

  const db = createDatabase(env.DATABASE);
  const [member] = await db
    .select({ userId: schema.facilityMember.userId })
    .from(schema.facilityMember)
    .where(and(eq(schema.facilityMember.facilityId, facilityId), eq(schema.facilityMember.userId, ctx.userId)))
    .limit(1);

  if (!member) {
    throw new Error("Access denied");
  }
  return ctx;
}
