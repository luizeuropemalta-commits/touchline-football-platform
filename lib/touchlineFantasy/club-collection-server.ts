import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspectClubAcquisition, type ClubAcquisitionState } from "./club-acquisition";
import type { ClubAcquisitionStore } from "./club-acquisition-service";

export const clubCollectionEnabled = () => process.env.TOUCHLINE_CLUB_COLLECTION_ENABLED === "true";
/** Off until atomic release migration, concurrency and recovery gates pass. */
export const clubReleaseEnabled = () => clubCollectionEnabled() && process.env.TOUCHLINE_CLUB_RELEASE_ENABLED === "true";

/** No direct client grants; always scope every read by authenticated owner AND season. */
export function createClubCollectionStore(admin: NonNullable<ReturnType<typeof createAdminClient>>): ClubAcquisitionStore {
  return {
    async read(ownerId, seasonId) {
      const { data, error } = await admin.from("touchline_club_collections").select("state")
        .eq("user_id", ownerId).eq("season_id", seasonId).maybeSingle();
      if (error) throw new Error("CLUB_STORAGE_UNAVAILABLE");
      if (!data) return null;
      const state = data.state as ClubAcquisitionState;
      inspectClubAcquisition(state);
      if (state.seasonId !== seasonId) throw new Error("CLUB_SEASON_MISMATCH");
      return state;
    },
    async commit(ownerId, before, next, command) {
      const { data, error } = await admin.rpc("touchline_club_commit_acquisition", {
        p_user_id: ownerId, p_season_id: before.seasonId, p_expected_revision: before.revision,
        p_next: next, p_command: command,
      });
      if (error) throw new Error(error.message.match(/CLUB_[A-Z_]+/)?.[0] ?? "CLUB_STORAGE_UNAVAILABLE");
      return data as ClubAcquisitionState;
    },
  };
}
