import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveServerReadWithin } from "./server-read-deadline.ts";
import { legacyCoachCatalogue, parseCoachCatalogue, UNAVAILABLE_COACH_CATALOGUE, type CoachCatalogue, catalogueCoachAssignments } from "./coach-catalogue-contract.ts";

export const coachCatalogueEnabled = () => process.env.TOUCHLINE_COACH_CATALOGUE_ENABLED === "true";
export const coachEditorialEnabled = () => process.env.TOUCHLINE_COACH_EDITORIAL_ENABLED === "true";
/** Request-local cache only. Only an explicit database OFF receipt selects legacy mode. Missing rows, errors and ignored candidates never do. */
export const loadCoachCatalogue = cache(async (): Promise<CoachCatalogue> => {
  if (!coachCatalogueEnabled()) return legacyCoachCatalogue();
  const admin = createAdminClient();
  if (!admin) return UNAVAILABLE_COACH_CATALOGUE;
  try {
    const result = await resolveServerReadWithin(admin.rpc("touchline_read_coach_catalogue_state").abortSignal(AbortSignal.timeout(8_000)), null, 8_000);
    if (!result || result.error || !result.data || typeof result.data !== "object" || Array.isArray(result.data)) return UNAVAILABLE_COACH_CATALOGUE;
    const state = result.data as Record<string, unknown>;
    if (state.mode === "legacy" && Object.keys(state).length === 1) return legacyCoachCatalogue();
    if (state.mode === "published" && Object.keys(state).length === 2 && Object.hasOwn(state, "catalogue")) return parseCoachCatalogue(state.catalogue);
    return UNAVAILABLE_COACH_CATALOGUE;
  } catch { return UNAVAILABLE_COACH_CATALOGUE; }
});
export async function readCompetitionCoachAssignments() { return catalogueCoachAssignments(await loadCoachCatalogue()); }
/** Called only after a feed persisted. SQL reads the exact stored normalized evidence; no extra provider request. */
export async function stageObservedCoachFixture(admin: NonNullable<ReturnType<typeof createAdminClient>>, fixtureId: string): Promise<string | null> {
  if (!coachEditorialEnabled()) return null;
  try {
    const result = await admin.rpc("touchline_stage_coach_fixture", { p_fixture_id: fixtureId }).abortSignal(AbortSignal.timeout(8_000));
    return result.error || !Number.isSafeInteger(result.data) || result.data < 0 ? "coach-editorial:staging-unconfirmed" : null;
  } catch { return "coach-editorial:staging-unavailable"; }
}
