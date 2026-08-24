import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchLineActiveRanking } from "./card-ranking-server";

import type { TouchlinePublicSeasonPlayerPoints } from "./matchday-player-points";
import { projectTouchlineCardStatsByPosition } from "./position-aware-card-stats";

type Row = Readonly<{ football_player_id?: unknown; summary_payload?: unknown; position_statistics_payload?: unknown }>;
type PlayerRow = Readonly<{ id?: unknown; position?: unknown; provider_position?: unknown; detailed_position?: unknown }>;
const TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID = "8";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * Public, allowlisted season-total projection for cards already present in a
 * public club roster. It reads no contracts, owner data or editorial fields.
 */
export async function readPublicSeasonPlayerPoints(
  canonicalPlayerIds: readonly string[],
): Promise<TouchlinePublicSeasonPlayerPoints[]> {
  const ids = [...new Set(canonicalPlayerIds.map((id) => id.trim()).filter(Boolean))];
  const admin = createAdminClient();
  if (!ids.length || !admin) return [];
  const [activeRanking, competitionResult] = await Promise.all([
    loadTouchLineActiveRanking(),
    admin
      .from("football_competitions")
      .select("id")
      .eq("provider", "sportmonks")
      .eq("provider_competition_id", TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID)
      .maybeSingle(),
  ]);
  const { data: competition, error: competitionError } = competitionResult;
  const competitionId = String(competition?.id ?? "").trim();
  if (competitionError || !competitionId) return [];
  const { data: seasons, error: seasonsError } = await admin
    .from("football_seasons")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("is_current", true);
  const seasonIds = Array.isArray(seasons)
    ? seasons.map((season) => String(season.id ?? "").trim()).filter(Boolean)
    : [];
  if (seasonsError || seasonIds.length !== 1) return [];
  const [{ data, error }, { data: playerData, error: playerError }] = await Promise.all([
    admin
      .from("football_player_season_statistics")
      .select("football_player_id,summary_payload,position_statistics_payload")
      .eq("competition_id", competitionId)
      .eq("season_id", seasonIds[0])
      .in("football_player_id", ids),
    admin
      .from("football_players")
      .select("id,position,provider_position,detailed_position")
      .in("id", ids),
  ]);
  if (error || playerError || !Array.isArray(data) || !Array.isArray(playerData)) return [];
  // Profile and Ranking already resolve their visible cumulative rating from
  // this immutable V3 snapshot if a season row is not the currently-marked
  // one. The Club Hub must use the same canonical fallback, rather than
  // turning a valid published rating into an em dash because of a season flag
  // transition.
  const rankingTotalRatingByPlayerId = new Map(
    activeRanking.phase === "ranked" && activeRanking.scoringVersion === "player_scoring_v3"
      ? activeRanking.players.flatMap((player) => (
        player.totalRating === null || !Number.isFinite(player.totalRating)
          ? []
          : [[String(player.playerId).trim(), player.totalRating] as const]
      ))
      : [],
  );
  const positionByPlayerId = new Map((playerData as PlayerRow[]).flatMap((player) => {
    const playerId = String(player.id ?? "").trim();
    const position = [player.detailed_position, player.provider_position, player.position]
      .map((value) => String(value ?? "").trim())
      .find(Boolean);
    return playerId && position ? [[playerId, position] as const] : [];
  }));
  const seasonRowByPlayerId = new Map((data as Row[]).flatMap((row) => {
    const canonicalPlayerId = String(row.football_player_id ?? "").trim();
    return canonicalPlayerId ? [[canonicalPlayerId, row] as const] : [];
  }));
  return ids.flatMap((canonicalPlayerId) => {
    const row = seasonRowByPlayerId.get(canonicalPlayerId);
    const summary = record(row?.summary_payload);
    const positionStatistics = record(row?.position_statistics_payload);
    const statistic = (...keys: string[]) => {
      for (const key of keys) {
        const value = finiteNumber(summary?.[key]) ?? finiteNumber(positionStatistics?.[key]);
        if (value !== null) return value;
      }
      return undefined;
    };
    const touchlinePoints = finiteNumber(summary?.touchlinePoints);
    // `totalRating` is materialised by the V3 season aggregation from valid
    // Sportmonks appearance ratings. It is an allowlisted public fact, not a
    // card calculation; preserve null when the provider supplied no rating.
    const totalRating = finiteNumber(summary?.totalRating)
      ?? rankingTotalRatingByPlayerId.get(canonicalPlayerId)
      ?? null;
    const yellowCards = statistic("yellowCards", "yellow-cards", "yellowcards");
    const redCards = statistic("redCards", "red-cards", "redcards");
    const unscopedStatistics = {
      ...(statistic("goals") === undefined ? {} : { goals: statistic("goals")! }),
      ...(statistic("assists") === undefined ? {} : { assists: statistic("assists")! }),
      ...(yellowCards === undefined ? {} : { yellowCards }),
      ...(redCards === undefined ? {} : { redCards }),
      ...(statistic("cleanSheets", "clean-sheets", "cleansheets") === undefined ? {} : { cleanSheets: statistic("cleanSheets", "clean-sheets", "cleansheets")! }),
      ...(statistic("saves") === undefined ? {} : { saves: statistic("saves")! }),
      ...(statistic("goalsConceded", "goalkeeper-goals-conceded", "goals-conceded") === undefined ? {} : { goalsConceded: statistic("goalsConceded", "goalkeeper-goals-conceded", "goals-conceded")! }),
      ...(statistic("def-score") === undefined ? {} : { defense: statistic("def-score")! }),
      ...(statistic("rating") === undefined ? {} : { rating: statistic("rating")! }),
    };
    const statistics = (projectTouchlineCardStatsByPosition({
      position: positionByPlayerId.get(canonicalPlayerId),
      statistics: unscopedStatistics,
    }) as TouchlinePublicSeasonPlayerPoints["statistics"] | undefined) ?? {};
    // A player may have an active V3 ranking total while its season aggregate
    // row is waiting for the current-season marker. That is a valid persisted
    // rating fact with no invented stats, so retain it for the shared card.
    return row || totalRating !== null ? [{ canonicalPlayerId, touchlinePoints, totalRating, statistics }] : [];
  });
}
