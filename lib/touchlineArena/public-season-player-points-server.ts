import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchLineActiveRanking } from "./card-ranking-server";

import type { TouchlinePublicSeasonPlayerPoints } from "./matchday-player-points";
import { projectTouchlineCardStatsByPosition } from "./position-aware-card-stats";

type Row = Readonly<{ football_player_id?: unknown; summary_payload?: unknown; position_statistics_payload?: unknown }>;
type PlayerRow = Readonly<{ id?: unknown; position?: unknown; provider_position?: unknown; detailed_position?: unknown }>;
const TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID = "8";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PublicSeasonPlayerPointsOptions = Readonly<{
  competitionId?: string;
  seasonId?: string;
  providedAdmin?: NonNullable<ReturnType<typeof createAdminClient>>;
}>;

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
  options: PublicSeasonPlayerPointsOptions = {},
): Promise<TouchlinePublicSeasonPlayerPoints[]> {
  const ids = [...new Set(canonicalPlayerIds.map((id) => id.trim()).filter(Boolean))];
  const admin = options.providedAdmin ?? createAdminClient();
  if (!ids.length || !admin) return [];
  const requestedCompetitionId = options.competitionId?.trim() ?? "";
  const requestedSeasonId = options.seasonId?.trim() ?? "";
  const fixtureSeasonScoped = UUID.test(requestedCompetitionId) && UUID.test(requestedSeasonId);
  if (Boolean(requestedCompetitionId || requestedSeasonId) && !fixtureSeasonScoped) return [];
  const competitionRead = fixtureSeasonScoped
    ? Promise.resolve({ data: { id: requestedCompetitionId }, error: null })
    : admin
      .from("football_competitions")
      .select("id")
      .eq("provider", "sportmonks")
      .eq("provider_competition_id", TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID)
      .maybeSingle();
  const [activeRanking, competitionResult] = await Promise.all([
    loadTouchLineActiveRanking(),
    competitionRead,
  ]);
  // The published V3 snapshot is the canonical source for the cumulative
  // rating. It remains usable even while the season aggregate's `is_current`
  // marker is being transitioned, so never make an otherwise valid rating
  // depend on that presentation-only marker.
  const rankingTotalRatingByPlayerId = new Map(
    activeRanking.phase === "ranked" && activeRanking.scoringVersion === "player_scoring_v3"
      ? activeRanking.players.flatMap((player) => (
        player.totalRating === null || !Number.isFinite(player.totalRating)
          ? []
          : [[String(player.playerId).trim(), player.totalRating] as const]
      ))
      : [],
  );
  const rankingOnlyProjection = () => ids.flatMap((canonicalPlayerId) => {
    const totalRating = rankingTotalRatingByPlayerId.get(canonicalPlayerId) ?? null;
    return totalRating === null ? [] : [{ canonicalPlayerId, touchlinePoints: null, totalRating, statistics: {} }];
  });
  const { data: competition, error: competitionError } = competitionResult;
  const competitionId = String(competition?.id ?? "").trim();
  if (competitionError || !competitionId) return rankingOnlyProjection();
  let seasonId = requestedSeasonId;
  if (!fixtureSeasonScoped) {
    const { data: seasons, error: seasonsError } = await admin
      .from("football_seasons")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("is_current", true);
    const seasonIds = Array.isArray(seasons)
      ? seasons.map((season) => String(season.id ?? "").trim()).filter(Boolean)
      : [];
    if (seasonsError || seasonIds.length !== 1) return rankingOnlyProjection();
    [seasonId] = seasonIds;
  }
  const [{ data, error }, { data: playerData, error: playerError }] = await Promise.all([
    admin
      .from("football_player_season_statistics")
      .select("football_player_id,summary_payload,position_statistics_payload")
      .eq("competition_id", competitionId)
      .eq("season_id", seasonId)
      // V2 rows remain in this table strictly for audit/history. Public Card
      // surfaces must consume the immutable V3 Rating aggregate only.
      .eq("scoring_version", "player_scoring_v3")
      .in("football_player_id", ids),
    admin
      .from("football_players")
      .select("id,position,provider_position,detailed_position")
      .in("id", ids),
  ]);
  // Stats are supplementary card fields. A transient read of them must not
  // suppress the already-published V3 rating from every card.
  const seasonRows = error || !Array.isArray(data) ? [] : data as Row[];
  const players = playerError || !Array.isArray(playerData) ? [] : playerData as PlayerRow[];
  // Profile and Ranking already resolve their visible cumulative rating from
  // this immutable V3 snapshot if a season row is not the currently-marked
  // one. The Club Hub must use the same canonical fallback, rather than
  // turning a valid published rating into an em dash because of a season flag
  // transition.
  const positionByPlayerId = new Map(players.flatMap((player) => {
    const playerId = String(player.id ?? "").trim();
    const position = [player.detailed_position, player.provider_position, player.position]
      .map((value) => String(value ?? "").trim())
      .find(Boolean);
    return playerId && position ? [[playerId, position] as const] : [];
  }));
  const seasonRowByPlayerId = new Map(seasonRows.flatMap((row) => {
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
