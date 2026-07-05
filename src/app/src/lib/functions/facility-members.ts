import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import { createDatabase, schema } from "#/lib/database";
import { requireFacilityAccess } from "#/lib/functions/access";

export interface FacilityMemberRow {
  userId: string;
  userName: string;
  userEmail: string;
  role: string;
}

export const getFacilityMembers = createServerFn({ method: "GET" })
  .validator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }): Promise<FacilityMemberRow[]> => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);

    const rows = await db
      .select({
        userId: schema.facilityMember.userId,
        userName: schema.user.name,
        userEmail: schema.user.email,
        role: schema.user.role,
      })
      .from(schema.facilityMember)
      .innerJoin(schema.user, eq(schema.facilityMember.userId, schema.user.id))
      .where(eq(schema.facilityMember.facilityId, data.facilityId));

    return rows;
  });

export const addFacilityMember = createServerFn({ method: "POST" })
  .validator((data: { facilityId: string; email: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.email || typeof data.email !== "string") throw new Error("Email is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);

    const [user] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, data.email.toLowerCase()))
      .limit(1);

    if (!user) throw new Error("User not found");

    await db.insert(schema.facilityMember).values({
      facilityId: data.facilityId,
      userId: user.id,
    });

    return { success: true };
  });

export const removeFacilityMember = createServerFn({ method: "POST" })
  .validator((data: { facilityId: string; userId: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.userId) throw new Error("User ID is required");
    return data;
  })
  .handler(async ({ data }) => {
    const db = createDatabase(env.DATABASE);
    await requireFacilityAccess(data.facilityId);

    await db
      .delete(schema.facilityMember)
      .where(and(eq(schema.facilityMember.facilityId, data.facilityId), eq(schema.facilityMember.userId, data.userId)));

    return { success: true };
  });
