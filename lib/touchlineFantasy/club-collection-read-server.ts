import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { clubCollectionEnabled, clubReleaseEnabled, createClubCollectionStore } from "@/lib/touchlineFantasy/club-collection-server";
import { readClubInitialBudget } from "@/lib/touchlineFantasy/club-initial-budget-server";
import type { ClubAcquisitionState } from "./club-acquisition";
import type { ClubInitialBudget } from "./club-initial-budget";

export type ClubCollectionReadResult = {
  status: "confirmed"; accountId: string; seasonId: string;
  state: ClubAcquisitionState | null; initialBudget: ClubInitialBudget | null; releaseAvailable: boolean; coachLifecycleAvailable?: boolean;
} | {
  status: "unavailable"; error: "AUTH_REQUIRED" | "CLUB_COLLECTION_UNAVAILABLE" | "CLUB_STORAGE_UNAVAILABLE" | "CLUB_SEASON_UNAVAILABLE";
  httpStatus: 401 | 503;
};

/** Server callers MUST supply identity from verified auth, never request parameters.
 * Read-only and uncached: unavailable is never a confirmed empty collection. */
export async function readClubCollectionServer(authenticatedOwnerId: string | null,
  mark: (phase: string) => void = () => {}): Promise<ClubCollectionReadResult> {
  const unavailable = (error: Extract<ClubCollectionReadResult, {status: "unavailable"}>["error"], httpStatus: 401 | 503 = 503): ClubCollectionReadResult => ({ status: "unavailable", error, httpStatus });
  if (!authenticatedOwnerId) return unavailable("AUTH_REQUIRED", 401);
  try {
    if (!clubCollectionEnabled()) return unavailable("CLUB_COLLECTION_UNAVAILABLE");
    const admin = createAdminClient();
    if (!admin) return unavailable("CLUB_STORAGE_UNAVAILABLE");
    const { data: config, error } = await admin.from("touchline_fantasy_configs").select("season_id")
      .eq("competition_key", "england").eq("status", "active").single();
    mark("season");
    if (error || !config?.season_id) return unavailable("CLUB_SEASON_UNAVAILABLE");
    const seasonId = String(config.season_id);
    const store = createClubCollectionStore(admin);
    let state = await store.read(authenticatedOwnerId, seasonId);
    mark("collection");
    let initialBudget = state ? null : await readClubInitialBudget(admin, authenticatedOwnerId, seasonId);
    // A simultaneous first signing wins over the pre-signing allowance.
    if (!state) state = await store.read(authenticatedOwnerId, seasonId);
    if (state) initialBudget = null;
    mark("budget");
    return { status: "confirmed", accountId: authenticatedOwnerId, seasonId, state, initialBudget, releaseAvailable: clubReleaseEnabled(), coachLifecycleAvailable: process.env.TOUCHLINE_CLUB_COACH_LIFECYCLE_ENABLED === "true" };
  } catch { return unavailable("CLUB_STORAGE_UNAVAILABLE"); }
}
