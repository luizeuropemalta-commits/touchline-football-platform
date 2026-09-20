import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { inferArenaRole, makeArenaShortName, normalizeOfficialShirtNumber } from "@/lib/football-data/arena-lineup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCompleteTouchlineCatalogueAdmin, loadCompleteTouchlineCataloguePresentations } from "./complete-catalogue-read-server";
import { formatTouchlineMarketValueEur } from "./editorial-card-profile";
import { hasTouchlineCountryFlag, normalizeTouchlineCountryCode3, touchlineCountryCode3FromName } from "./country-flags";
import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
import { applyTouchlineSeasonPoints } from "./matchday-player-points";
import { readPublicSeasonPlayerPoints } from "./public-season-player-points-server";
import {
  projectTouchlineCardStatsByPosition,
  type TouchlineCardStats,
} from "./position-aware-card-stats";

type Row = Record<string, unknown>;

function rows(value: unknown): Row[] { return Array.isArray(value) ? value as Row[] : []; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function object(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function countryCode(player: Row) {
  const fromName = touchlineCountryCode3FromName(text(player.nationality));
  if (fromName && hasTouchlineCountryFlag(fromName)) return fromName;
  const stored = normalizeTouchlineCountryCode3(text(player.country_id));
  return hasTouchlineCountryFlag(stored) ? stored : "N/A";
}
function verifiedStats(row: Row | undefined, playerPosition: string, includeUnavailableRating = false) {
  const summary = object(row?.summary_payload);
  const position = object(row?.position_statistics_payload);
  const value = (...keys: string[]) => keys.map((key) => number(summary[key]) ?? number(position[key])).find((entry) => entry !== null) ?? null;
  const yellow = value("yellowCards", "yellow-cards", "yellowcards");
  const red = value("redCards", "red-cards", "redcards");
  const entries = [
    ["goals", value("goals")], ["assists", value("assists")], ["defense", value("def-score")],
    ["cleanSheets", value("cleanSheets", "clean-sheets", "cleansheets")], ["yellowCards", yellow], ["redCards", red],
    ["cards", yellow === null || red === null ? null : yellow + red], ["saves", value("saves")],
    ["goalsConceded", value("goalsConceded", "goalkeeper-goals-conceded", "goals-conceded")],
    ["minutes", value("minutes")], ["appearances", value("appearances")], ["shotsOnTarget", value("shots-on-target")],
    ["shotsOffTarget", value("shots-off-target")], ["defensiveActionsTotal", value("defensive-actions-total")],
    ["penaltySaves", value("penalty-saves")], ["penaltiesMissed", value("penalties-missed")], ["ownGoals", value("own-goals")],
  ].filter((entry): entry is [string, number] => typeof entry[1] === "number");
  const rating = number(row?.rating) ?? value("rating");
  const statistics = {
    ...Object.fromEntries(entries),
    ...(rating !== null || includeUnavailableRating ? { rating } : {}),
  } as TouchlineCardStats;
  return projectTouchlineCardStatsByPosition({
    position: playerPosition,
    statistics: Object.keys(statistics).length ? statistics : undefined,
  });
}
function verifiedMatchStats(row: Row | undefined, playerPosition: string) {
  if (!row) return undefined;
  return verifiedStats({
    summary_payload: row.statistics_payload,
    position_statistics_payload: row.statistics_payload,
    rating: row.rating,
  }, playerPosition, true);
}

function requireCompleteRankedSeasonProjection(
  playerIds: readonly string[],
  points: readonly { canonicalPlayerId: string }[],
) {
  const expected = new Set(playerIds.map((playerId) => playerId.trim().toLowerCase()).filter(Boolean));
  const received = new Set<string>();
  for (const point of points) {
    const playerId = point.canonicalPlayerId.trim().toLowerCase();
    if (!expected.has(playerId) || received.has(playerId)) {
      throw new Error("TL_RANKED_CATALOGUE_SEASON_PROJECTION_INCOMPLETE");
    }
    received.add(playerId);
  }
  if (received.size !== expected.size) {
    throw new Error("TL_RANKED_CATALOGUE_SEASON_PROJECTION_INCOMPLETE");
  }
}

/** Public published-card catalogue decorated from canonical Sportmonks ratings. */
export async function loadTouchLineRankedCardCatalog(
  state: TouchlineActiveRankingState,
  providedAdmin?: SupabaseClient | null,
): Promise<ClubOwnerSquadCard[]> {
  if (state.phase !== "ranked" || state.scoringVersion !== "player_scoring_v3" || !state.seasonId || !state.players.length) return [];
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return [];
  const catalogueAdmin = createCompleteTouchlineCatalogueAdmin(admin);
  const playerIds = [...new Set(state.players.map((player) => String(player.playerId).trim().toLowerCase()).filter(Boolean))];
  const [{ data: playerData }, { data: squadData }, { data: fixtureData }, seasonPoints, published] = await Promise.all([
    catalogueAdmin.from("football_players").select("id,provider_player_id,display_name,name,current_club_id,nationality,country_id,position,provider_position,detailed_position").in("id", playerIds),
    catalogueAdmin.from("football_squad_members").select("player_id,club_id,jersey_number,position,status,source_updated_at").in("player_id", playerIds).eq("status", "active").order("source_updated_at", { ascending: false }),
    catalogueAdmin.from("touchline_player_fixture_score_settlements").select("football_player_id,rating,statistics_payload,football_fixtures!inner(starts_at)").eq("season_id", state.seasonId).eq("scoring_version", "player_scoring_v3").in("football_player_id", playerIds),
    readPublicSeasonPlayerPoints(playerIds, {
      providedAdmin: catalogueAdmin,
      seasonId: state.seasonId,
      publishedRankingState: state,
    }),
    loadCompleteTouchlineCataloguePresentations(playerIds, catalogueAdmin),
  ]);
  requireCompleteRankedSeasonProjection(playerIds, seasonPoints);
  const players = rows(playerData);
  const clubIds = [...new Set(players.map((player) => text(player.current_club_id)).filter((id): id is string => Boolean(id)))];
  const { data: clubData } = clubIds.length
    ? await catalogueAdmin.from("football_clubs").select("id,name").in("id", clubIds)
    : { data: [] };
  const playerById = new Map(players.flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const clubById = new Map(rows(clubData).flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const squadByPlayerId = new Map<string, Row>();
  for (const row of rows(squadData)) {
    const playerId = text(row.player_id);
    if (playerId && !squadByPlayerId.has(playerId)) squadByPlayerId.set(playerId, row);
  }
  const matchByPlayerId = new Map<string, Row>();
  for (const row of rows(fixtureData)) {
    const playerId = text(row.football_player_id);
    const current = playerId ? matchByPlayerId.get(playerId) : null;
    const startsAt = Date.parse(text(object(row.football_fixtures).starts_at) ?? "");
    const currentStartsAt = Date.parse(text(object(current?.football_fixtures).starts_at) ?? "");
    if (playerId && (!current || (Number.isFinite(startsAt) && (!Number.isFinite(currentStartsAt) || startsAt > currentStartsAt)))) {
      matchByPlayerId.set(playerId, row);
    }
  }

  const cards = state.players.flatMap((ranking): ClubOwnerSquadCard[] => {
    const playerId = String(ranking.playerId).toLowerCase();
    const player = playerById.get(playerId);
    const editorialCard = published.get(playerId);
    if (!player || !editorialCard) return [];
    const squad = squadByPlayerId.get(playerId);
    const clubName = text(clubById.get(text(player.current_club_id) ?? "")?.name) ?? "Club pending";
    const name = text(player.display_name) ?? text(player.name);
    if (!name) return [];
    const position = text(squad?.position) ?? text(player.detailed_position) ?? text(player.provider_position) ?? text(player.position) ?? "Player";
    const match = matchByPlayerId.get(playerId);
    return [{
      id: playerId,
      providerPlayerId: text(player.provider_player_id),
      canonicalPlayerId: playerId,
      name,
      shortName: makeArenaShortName(name),
      role: inferArenaRole(position),
      position,
      clubName,
      shirtNumber: editorialCard.shirtNumber ?? normalizeOfficialShirtNumber(squad?.jersey_number),
      countryCode3: countryCode(player),
      marketValue: editorialCard.marketValueEur === undefined
        ? ""
        : formatTouchlineMarketValueEur(editorialCard.marketValueEur, "en-GB"),
      marketValueSource: editorialCard.marketValueEur === undefined
        ? "unavailable" as const
        : editorialCard.marketValueState === "provisional"
          ? "provisional-fallback" as const
          : "verified-cache" as const,
      marketValueState: editorialCard.marketValueEur === undefined
        ? "unavailable" as const
        : editorialCard.marketValueState ?? "verified" as const,
      classificationState: editorialCard.marketValueState === "provisional" ? "provisional" as const : "verified" as const,
      cardTier: editorialCard.tierKey,
      editorialCard,
      // Kept only to satisfy the established private DTO while all active
      // player surfaces read the two rating fields below.
      touchlinePoints: 0,
      seasonTouchlinePoints: null,
      seasonTotalRating: null,
      publishedRanking: state.snapshotId && state.publishedAt ? {
        snapshotId: state.snapshotId,
        providerPlayerId: ranking.providerPlayerId ?? null,
        totalRating: ranking.totalRating,
        minutesPlayed: ranking.minutesPlayed ?? null,
        appearances: ranking.appearances ?? null,
      } : undefined,
      matchRating: number(match?.rating),
      matchStats: verifiedMatchStats(match, position),
    }];
  });
  return applyTouchlineSeasonPoints(cards, seasonPoints).map((card) => (
    card.publishedRanking && card.publishedRanking.totalRating !== card.seasonTotalRating
      ? { ...card, publishedRanking: undefined }
      : card
  ));
}

/**
 * Public ClubHub border showcase source. Unlike the competitive Ranking, this
 * catalogue follows the editorial publication lifecycle directly, so a
 * preseason ranking cannot hide an already published card. It is read-only
 * and still passes every row through the canonical publication gate above.
 */
export async function loadTouchlinePublishedCardShowcaseCatalog(
  providedAdmin?: SupabaseClient | null,
): Promise<ClubOwnerSquadCard[]> {
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return [];
  const catalogueAdmin = createCompleteTouchlineCatalogueAdmin(admin);

  const { data: publicationData } = await catalogueAdmin
    .from("touchline_card_publications")
    .select("player_id")
    .eq("publication_status", "published")
    .order("player_id", { ascending: true });

  const playerIds = [...new Set(rows(publicationData)
    .map((row) => text(row.player_id)?.toLowerCase())
    .filter((playerId): playerId is string => Boolean(playerId)))];
  if (!playerIds.length) return [];

  const [playersResponse, squadsResponse, seasonPoints, published] = await Promise.all([
    catalogueAdmin
      .from("football_players")
      .select("id,provider_player_id,display_name,name,current_club_id,nationality,country_id,position,provider_position,detailed_position")
      .in("id", playerIds),
    catalogueAdmin
      .from("football_squad_members")
      .select("player_id,club_id,jersey_number,position,status,source_updated_at")
      .in("player_id", playerIds)
      .eq("status", "active")
      .order("source_updated_at", { ascending: false }),
    readPublicSeasonPlayerPoints(playerIds, { providedAdmin: catalogueAdmin }),
    loadCompleteTouchlineCataloguePresentations(playerIds, catalogueAdmin),
  ]);
  if (!published.size) return [];

  const players = rows(playersResponse.data);
  const clubIds = [...new Set(players
    .map((player) => text(player.current_club_id))
    .filter((clubId): clubId is string => Boolean(clubId)))];
  const { data: clubData } = clubIds.length
    ? await catalogueAdmin.from("football_clubs").select("id,name").in("id", clubIds)
    : { data: [] };

  const playerById = new Map(players.flatMap((row) => {
    const playerId = text(row.id)?.toLowerCase();
    return playerId ? [[playerId, row] as const] : [];
  }));
  const clubById = new Map(rows(clubData).flatMap((row) => {
    const clubId = text(row.id);
    return clubId ? [[clubId, row] as const] : [];
  }));
  const squadByPlayerId = new Map<string, Row>();
  for (const row of rows(squadsResponse.data)) {
    const playerId = text(row.player_id)?.toLowerCase();
    if (playerId && !squadByPlayerId.has(playerId)) squadByPlayerId.set(playerId, row);
  }
  const cards = [...published.entries()].flatMap(([playerId, editorialCard]): ClubOwnerSquadCard[] => {
    const player = playerById.get(playerId);
    if (!player) return [];
    const squad = squadByPlayerId.get(playerId);
    const name = text(player.display_name) ?? text(player.name);
    if (!name) return [];
    const clubName = text(clubById.get(text(player.current_club_id) ?? "")?.name) ?? "Club pending";
    const position = text(squad?.position)
      ?? text(player.detailed_position)
      ?? text(player.provider_position)
      ?? text(player.position)
      ?? "Player";
    return [{
      id: playerId,
      providerPlayerId: text(player.provider_player_id),
      canonicalPlayerId: playerId,
      name,
      shortName: makeArenaShortName(name),
      role: inferArenaRole(position),
      position,
      clubName,
      shirtNumber: editorialCard.shirtNumber ?? normalizeOfficialShirtNumber(squad?.jersey_number),
      countryCode3: countryCode(player),
      marketValue: editorialCard.marketValueEur === undefined
        ? ""
        : formatTouchlineMarketValueEur(editorialCard.marketValueEur, "en-GB"),
      marketValueSource: editorialCard.marketValueEur === undefined
        ? "unavailable" as const
        : editorialCard.marketValueState === "provisional"
          ? "provisional-fallback" as const
          : "verified-cache" as const,
      marketValueState: editorialCard.marketValueEur === undefined
        ? "unavailable" as const
        : editorialCard.marketValueState ?? "verified" as const,
      classificationState: editorialCard.marketValueState === "provisional" ? "provisional" as const : "verified" as const,
      cardTier: editorialCard.tierKey,
      editorialCard,
      touchlinePoints: 0,
      seasonTouchlinePoints: null,
      seasonTotalRating: null,
      matchRating: null,
    }];
  });
  return applyTouchlineSeasonPoints(cards, seasonPoints);
}
