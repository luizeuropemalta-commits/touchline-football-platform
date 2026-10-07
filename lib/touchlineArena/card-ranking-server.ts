import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";
import type { TouchlinePublishedRankingSnapshot } from "./card-ranking-pipeline";
import { parseTouchlinePublishedTopEleven, type TouchlinePublishedTopEleven } from "./published-top-eleven";
import { parsePersistedTouchlinePlayerLeadership } from "./player-ranking-leadership";

export async function loadTouchLineActiveRanking(): Promise<TouchlineActiveRankingState> {
  return readRequestActiveRanking();
}

// Request-local only; a later render revalidates publication authority.
const readRequestActiveRanking = cache(async (): Promise<TouchlineActiveRankingState> => {
  const admin = createAdminClient();
  if (!admin) return TOUCHLINE_PRESEASON_RANKING_STATE;

  const { data: active, error: activeError } = await admin
    .from("touchline_card_ranking_active_snapshots")
    .select("snapshot_id")
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  // An unavailable read is not evidence that the competition has not started.
  // Let the route's retry boundary handle failure without publishing zero ranks.
  if (activeError) throw new Error("TOUCHLINE_RANKING_READ_UNAVAILABLE");
  if (!active?.snapshot_id) return TOUCHLINE_PRESEASON_RANKING_STATE;

  const snapshotRead = Promise.resolve(admin
    .from("touchline_card_ranking_snapshots")
    .select("snapshot_id, league_key, season_id, round_id, source, status, published_at, price_table_version, expected_player_count, actual_player_count, scoring_version, coverage_status, fixture_ids, expected_fixture_ids, total_score_points, ranking_payload")
    .eq("snapshot_id", active.snapshot_id)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle());
  // Both reads are pinned to the same pointer. Observe speculative failure even
  // when an invalid snapshot returns before leadership is consumed.
  const leadershipRead = Promise.resolve().then(() => admin
    .from("touchline_player_ranking_leadership_decisions")
    .select("ranking_id,status,leader_player_id,contender_player_ids")
    .eq("snapshot_id", active.snapshot_id)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle()).then(
      value => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  const { data: record, error } = await snapshotRead;
  if (error) throw new Error("TOUCHLINE_RANKING_READ_UNAVAILABLE");
  // V2/V3 conversion snapshots remain technical audit history only. A product
  // surface activates only the current fully auditable rating snapshot.
  if (!record || record.status !== "published" || record.source !== "sportmonks-audited" || record.scoring_version !== "player_scoring_v4" || (record.coverage_status !== "complete" && record.coverage_status !== "complete_for_scoring") || record.actual_player_count !== record.expected_player_count) {
    return TOUCHLINE_PRESEASON_RANKING_STATE;
  }

  const payload = record.ranking_payload as TouchlinePublishedRankingSnapshot;
  const leadershipOutcome = await leadershipRead;
  if (!leadershipOutcome.ok) throw leadershipOutcome.error;
  const { data: persistedLeadership, error: leadershipError } = leadershipOutcome.value;
  const playerIds = Array.isArray(payload?.players) ? payload.players.map((player) => player.playerId) : [];
  const leadershipDecision = leadershipError
    ? null
    : parsePersistedTouchlinePlayerLeadership({ value: persistedLeadership, snapshotId: record.snapshot_id, playerIds });
  const state = parseTouchlineActiveRankingState({
    phase: "ranked",
    leagueKey: record.league_key,
    snapshotId: record.snapshot_id,
    roundId: record.round_id,
    publishedAt: record.published_at,
    priceTableVersion: record.price_table_version,
    scoringVersion: record.scoring_version,
    coverageStatus: record.coverage_status,
    seasonId: record.season_id,
    fixtureIds: Array.isArray(record.fixture_ids) ? record.fixture_ids : [],
    expectedFixtureIds: Array.isArray(record.expected_fixture_ids) ? record.expected_fixture_ids : [],
    totalScorePoints: record.total_score_points,
    leadershipDecision,
    cardGoals: payload?.cardGoals,
    players: Array.isArray(payload?.players) ? payload.players.map((player) => ({
      playerId: player.playerId,
      providerPlayerId: player.providerPlayerId,
      positionGroup: player.positionGroup,
      positionRank: player.positionRank,
      groupSize: player.groupSize,
      totalRating: player.totalRating,
      minutesPlayed: player.minutesPlayed,
      appearances: player.appearances,
      tierKey: player.tierKey,
      priceTc: player.priceTc,
    })) : [],
  });

  return state && state.players.length === record.actual_player_count
    ? state
    : TOUCHLINE_PRESEASON_RANKING_STATE;
});

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
