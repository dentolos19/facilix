import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createDatabase, schema } from "#/src/lib/database";
import { DEFAULT_FACILITY_SETTINGS, type FacilitySettings, normalizeFacilitySettings } from "#/src/lib/monitoring/logs";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FacilitySettingsRow {
  facilityId: string;
  settings: FacilitySettings;
}

// ─── Server functions ──────────────────────────────────────────────────────

/**
 * Get the settings for a facility. Returns defaults for missing or invalid
 * settings so callers never have to handle null.
 */
export const getFacilitySettings = createServerFn({ method: "GET" })
  .inputValidator((data: { facilityId: string }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    return data;
  })
  .handler(async ({ data }): Promise<FacilitySettingsRow> => {
    const db = createDatabase(env.DATABASE);
    const [row] = await db
      .select({ settings: schema.facility.settings })
      .from(schema.facility)
      .where(eq(schema.facility.id, data.facilityId))
      .limit(1);

    return {
      facilityId: data.facilityId,
      settings: normalizeFacilitySettings(row?.settings ?? undefined),
    };
  });

/**
 * Save the settings for a facility. Only updates the `settings` column so it
 * can be saved independently of the canvas auto-save flow.
 */
export const saveFacilitySettings = createServerFn({ method: "POST" })
  .inputValidator((data: { facilityId: string; settings: FacilitySettings }) => {
    if (!data.facilityId) throw new Error("Facility ID is required");
    if (!data.settings || typeof data.settings !== "object") throw new Error("Settings object is required");
    if (!Array.isArray(data.settings.globalEvents?.enabledLogTypes)) {
      throw new Error("globalEvents.enabledLogTypes must be an array");
    }
    return data;
  })
  .handler(async ({ data }): Promise<FacilitySettingsRow> => {
    const db = createDatabase(env.DATABASE);
    const normalized = normalizeFacilitySettings(data.settings);

    await db.update(schema.facility).set({ settings: normalized }).where(eq(schema.facility.id, data.facilityId));

    return {
      facilityId: data.facilityId,
      settings: normalized,
    };
  });
