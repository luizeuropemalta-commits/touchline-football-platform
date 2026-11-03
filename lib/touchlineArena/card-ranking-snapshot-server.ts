import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";
import type { TouchlinePublishedRankingSnapshot } from "./card-ranking-pipeline";
import { parsePersistedTouchlinePlayerLeadership } from "./player-ranking-leadership";

/** Resolve only the immutable ID supplied by a shared publication, never its active pointer. */
export async function readTouchlinePlayerRankingSnapshot(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  snapshotId: string,
  strict = true,
): Promise<TouchlineActiveRankingState> {
  const invalid = () => {
    if (strict) throw new Error("TOUCHLINE_PINNED_RANKING_INVALID");
    return TOUCHLINE_PRESEASON_RANKING_STATE;
  };
  if (!snapshotId) return invalid();

  const snapshotRead = Promise.resolve(admin
    .from("touchline_card_ranking_snapshots")
    .select("snapshot_id, league_key, season_id, round_id, source, status, published_at, price_table_version, expected_player_count, actual_player_count, scoring_version, coverage_status, fixture_ids, expected_fixture_ids, total_score_points, ranking_payload")
    .eq("snapshot_id", snapshotId)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle());
  // Both reads are pinned to the same pointer. Observe speculative failure even
  // when an invalid snapshot returns before leadership is consumed.
  const leadershipRead = Promise.resolve().then(() => admin
    .from("touchline_player_ranking_leadership_decisions")
    .select("ranking_id,status,leader_player_id,contender_player_ids")
    .eq("snapshot_id", snapshotId)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle()).then(
      value => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
  const { data: record, error } = await snapshotRead;
  if (error) throw new Error("TOUCHLINE_RANKING_READ_UNAVAILABLE");
  // V2/V3 conversion snapshots remain technical audit history only. A product
  // surface activates only the current fully auditable rating snapshot.
  if (!record || record.snapshot_id !== snapshotId || record.league_key !== TOUCHLINE_ENGLAND_LEAGUE_KEY
    || record.status !== "published" || record.source !== "sportmonks-audited" || record.scoring_version !== "player_scoring_v4" || (record.coverage_status !== "complete" && record.coverage_status !== "complete_for_scoring") || record.actual_player_count !== record.expected_player_count) {
    return invalid();
  }

  const payload = record.ranking_payload as TouchlinePublishedRankingSnapshot;
  const leadershipOutcome = await leadershipRead;
  if (!leadershipOutcome.ok) throw leadershipOutcome.error;
  const { data: persistedLeadership, error: leadershipError } = leadershipOutcome.value;
  if (strict && leadershipError) throw new Error("TOUCHLINE_PINNED_RANKING_UNAVAILABLE");
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
    && !(strict && payload?.cardGoals != null && !state.cardGoals)
    ? state
    : invalid();
}
