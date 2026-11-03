import "server-only";
import { publicOwnerId } from "./clubowner-public-contract";
import { createAdminClient } from "@/lib/supabase/admin";
import { readClubOwnerStandingIndexForSeason, readClubOwnerProfileStandingForSeason } from "./club-owner-standings-server";
import { projectPublicOwnerSearchPage, validatePublicOwnerSearch } from "./clubowner-public-search";

/** No actor/season supplied by HTTP. The caller verifies the request user. */
export async function readPublicOwnerSearchPage(query: string, cursor: string | null, viewerAccountId: string | null) {
  validatePublicOwnerSearch(query, cursor);
  const admin = createAdminClient();
  if (!admin) throw new Error("PEOPLE_DIRECTORY_UNAVAILABLE");
  const signal = AbortSignal.timeout(10_000);
  const candidates = await admin.rpc("touchline_people_directory_candidates", { p_viewer: viewerAccountId }).abortSignal(signal);
  if (candidates.error || !Array.isArray(candidates.data) || candidates.data.length > 10_000 || signal.aborted) throw new Error("PEOPLE_DIRECTORY_UNAVAILABLE");
  // No public profiles is a known empty state; no private ranking read needed.
  if (candidates.data.length === 0) return projectPublicOwnerSearchPage([], [], query, cursor);
  const config = await admin.from("touchline_fantasy_configs").select("season_id")
    .eq("competition_key", "england").eq("status", "active").abortSignal(signal).single();
  if (config.error || typeof config.data?.season_id !== "string") throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  const ranking = await readClubOwnerStandingIndexForSeason(admin, config.data.season_id, signal);
  if (ranking === null || signal.aborted) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  return projectPublicOwnerSearchPage(candidates.data, ranking, query, cursor);
}

/** Only a profile already authorized by its public RPC may request this projection. */
export async function readPublicOwnerStanding(publicId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  const signal = AbortSignal.timeout(10_000);
  const candidates = await admin.rpc("touchline_people_directory_candidates", { p_viewer: null }).abortSignal(signal);
  if (candidates.error || !Array.isArray(candidates.data) || candidates.data.length > 10_000) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  const matches = candidates.data.filter(row => typeof row?.publicId === "string" && row.publicId.toLowerCase() === publicId.toLowerCase());
  if (matches.length !== 1 || !publicOwnerId(matches[0].accountId)) throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  const config = await admin.from("touchline_fantasy_configs").select("season_id")
    .eq("competition_key", "england").eq("status", "active").abortSignal(signal).single();
  if (config.error || typeof config.data?.season_id !== "string") throw new Error("PEOPLE_RANKING_UNAVAILABLE");
  return readClubOwnerProfileStandingForSeason(admin, config.data.season_id, matches[0].accountId, signal);
}
