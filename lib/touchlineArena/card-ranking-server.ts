import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TOUCHLINE_ENGLAND_LEAGUE_KEY, TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "./card-ranking-live";
import { parseTouchlinePublishedTopEleven, type TouchlinePublishedTopEleven } from "./published-top-eleven";
import { loadRequestTouchlineSportsPublication } from "./sports-publication-server";
export { readTouchlinePlayerRankingSnapshot } from "./card-ranking-snapshot-server";

/** Public SSR uses the same atomic publication as client refreshes. */
export async function loadTouchLineActiveRanking(): Promise<TouchlineActiveRankingState> {
  const publication = await loadRequestTouchlineSportsPublication();
  if (!publication) throw new Error("TOUCHLINE_SPORTS_PUBLICATION_UNAVAILABLE");
  // Only an explicit null ranking in a valid envelope is a preseason state.
  return publication.playerRanking ?? TOUCHLINE_PRESEASON_RANKING_STATE;
}

/** Reads only an immutable, audited published Top 11; absence is a valid state. */
export async function loadTouchLinePublishedTopEleven(ranking: TouchlineActiveRankingState): Promise<TouchlinePublishedTopEleven | null> {
  // Pin to the caller's validated publication: never resolve the active pointer
  // again while this page's catalogue is being built from an earlier snapshot.
  if (ranking.phase !== "ranked" || !ranking.snapshotId || !ranking.seasonId || ranking.scoringVersion !== "player_scoring_v4") return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: record, error } = await admin
    .from("touchline_card_ranking_snapshots")
    .select("snapshot_id,season_id,scoring_version,coverage_status,actual_player_count,expected_player_count,round_id,published_at,source,status,selection_payload")
    .eq("snapshot_id", ranking.snapshotId)
    .eq("season_id", ranking.seasonId)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  if (error || !record || record.snapshot_id !== ranking.snapshotId || record.season_id !== ranking.seasonId
    || record.status !== "published" || record.source !== "sportmonks-audited"
    || record.scoring_version !== ranking.scoringVersion
    || (record.coverage_status !== "complete" && record.coverage_status !== "complete_for_scoring")
    || record.actual_player_count !== record.expected_player_count) return null;
  return parseTouchlinePublishedTopEleven({
    snapshotId: record.snapshot_id,
    roundId: record.round_id,
    publishedAt: record.published_at,
    selectionPayload: record.selection_payload,
  });
}
