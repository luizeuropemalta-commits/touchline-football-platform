import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  type TouchlineActiveRankingState,
} from "./card-ranking-live";
import type { TouchlinePublishedRankingSnapshot } from "./card-ranking-pipeline";

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
    .select("snapshot_id, league_key, round_id, source, status, published_at, price_table_version, expected_player_count, actual_player_count, ranking_payload")
    .eq("snapshot_id", active.snapshot_id)
    .eq("league_key", TOUCHLINE_ENGLAND_LEAGUE_KEY)
    .maybeSingle();
  if (error || !record || record.status !== "published" || record.source !== "sportmonks-audited" || record.actual_player_count !== record.expected_player_count) {
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
    players: Array.isArray(payload?.players) ? payload.players.map((player) => ({
      playerId: player.playerId,
      providerPlayerId: player.providerPlayerId,
      positionGroup: player.positionGroup,
      positionRank: player.positionRank,
      groupSize: player.groupSize,
      touchlinePoints: player.touchlinePoints,
      roundPoints: player.roundPoints,
      tierKey: player.tierKey,
      priceTc: player.priceTc,
    })) : [],
  });

  return state && state.players.length === record.actual_player_count
    ? state
    : TOUCHLINE_PRESEASON_RANKING_STATE;
}
