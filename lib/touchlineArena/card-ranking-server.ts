import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";
import type { TouchlinePublishedRankingSnapshot } from "./card-ranking-pipeline";
import { parseTouchlinePublishedTopEleven, type TouchlinePublishedTopEleven } from "./published-top-eleven";

export async function loadTouchLineActiveRanking(): Promise<TouchlineActiveRankingState> {
  const admin = createAdminClient();
  if (!admin) return TOUCHLINE_PRESEASON_RANKING_STATE;

  const { data: active, error: activeError } = await admin
    .from("touchline_card_ranking_active_snapshots")
    .select("snapshot_id")
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  if (activeError || !active?.snapshot_id) return TOUCHLINE_PRESEASON_RANKING_STATE;

  const { data: record, error } = await admin
    .from("touchline_card_ranking_snapshots")
    .select("snapshot_id, league_key, season_id, round_id, source, status, published_at, price_table_version, expected_player_count, actual_player_count, scoring_version, coverage_status, fixture_ids, expected_fixture_ids, total_score_points, ranking_payload")
    .eq("snapshot_id", active.snapshot_id)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  // V2/V3 conversion snapshots remain technical audit history only. A product
  // surface activates only the current fully auditable rating snapshot.
  if (error || !record || record.status !== "published" || record.source !== "sportmonks-audited" || record.scoring_version !== "player_scoring_v3" || (record.coverage_status !== "complete" && record.coverage_status !== "complete_for_scoring") || record.actual_player_count !== record.expected_player_count) {
    return TOUCHLINE_PRESEASON_RANKING_STATE;
  }

  const payload = record.ranking_payload as TouchlinePublishedRankingSnapshot;
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
    players: Array.isArray(payload?.players) ? payload.players.map((player) => ({
      playerId: player.playerId,
      providerPlayerId: player.providerPlayerId,
      positionGroup: player.positionGroup,
      positionRank: player.positionRank,
      groupSize: player.groupSize,
      totalRating: player.totalRating,
      tierKey: player.tierKey,
      priceTc: player.priceTc,
    })) : [],
  });

  return state && state.players.length === record.actual_player_count
    ? state
    : TOUCHLINE_PRESEASON_RANKING_STATE;
}

/** Reads only an immutable, audited published Top 11; absence is a valid state. */
export async function loadTouchLinePublishedTopEleven(): Promise<TouchlinePublishedTopEleven | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data: active, error: activeError } = await admin
    .from("touchline_card_ranking_active_snapshots")
    .select("snapshot_id")
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  if (activeError || !active?.snapshot_id) return null;
  const { data: record, error } = await admin
    .from("touchline_card_ranking_snapshots")
    .select("snapshot_id,round_id,published_at,source,status,selection_payload")
    .eq("snapshot_id", active.snapshot_id)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  if (error || !record || record.status !== "published" || record.source !== "sportmonks-audited") return null;
  return parseTouchlinePublishedTopEleven({
    snapshotId: record.snapshot_id,
    roundId: record.round_id,
    publishedAt: record.published_at,
    selectionPayload: record.selection_payload,
  });
}
