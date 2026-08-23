import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { inferArenaRole, makeArenaShortName, normalizeOfficialShirtNumber } from "@/lib/football-data/arena-lineup";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchlinePublishedCardPresentations } from "./card-publication-read-model";
import { hasTouchlineCountryFlag, normalizeTouchlineCountryCode3, touchlineCountryCode3FromName } from "./country-flags";
import type { TouchlineActiveRankingState } from "./card-ranking-live";
import type { ClubOwnerSquadCard } from "./demo-data";
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
function contributions(row?: Row): NonNullable<ClubOwnerSquadCard["matchPointContributions"]> {
  if (!Array.isArray(row?.touchline_points_breakdown)) return [];
  return row.touchline_points_breakdown.flatMap((value) => {
    const item = object(value);
    const role = item.role === "primary" || item.role === "assist" || item.role === "fact" ? item.role : null;
    const eventType = text(item.eventType);
    const points = number(item.points);
    if (!role || !eventType || points === null) return [];
    return [{
      role, eventType, points, minute: number(item.minute),
      ...(text(item.ruleCode) ? { ruleCode: text(item.ruleCode)! } : {}),
      ...(number(item.quantity) === null ? {} : { quantity: number(item.quantity)! }),
      ...(number(item.unitPoints) === null ? {} : { unitPoints: number(item.unitPoints)! }),
      ...(number(item.factValue) === null ? {} : { factValue: number(item.factValue)! }),
      ...(text(item.detail) ? { detail: text(item.detail)! } : {}),
    }];
  });
}

/** Public published-card catalogue decorated only with canonical V2 read models. */
export async function loadTouchLineRankedCardCatalog(
  state: TouchlineActiveRankingState,
  providedAdmin?: SupabaseClient | null,
): Promise<ClubOwnerSquadCard[]> {
  if (state.phase !== "ranked" || state.scoringVersion !== "player_scoring_v2" || !state.seasonId || !state.players.length) return [];
  const admin = providedAdmin ?? createAdminClient();
  if (!admin) return [];
  const playerIds = state.players.map((player) => String(player.playerId)).filter(Boolean);
  const [{ data: playerData, error: playerError }, { data: squadData, error: squadError }, { data: seasonData, error: seasonError }, { data: fixtureData, error: fixtureError }] = await Promise.all([
    admin.from("football_players").select("id,display_name,name,current_club_id,nationality,country_id,position,provider_position,detailed_position").in("id", playerIds),
    admin.from("football_squad_members").select("player_id,club_id,jersey_number,position,status,source_updated_at").in("player_id", playerIds).eq("status", "active").order("source_updated_at", { ascending: false }),
    admin.from("football_player_season_statistics").select("football_player_id,summary_payload,position_statistics_payload").eq("season_id", state.seasonId).eq("scoring_version", "player_scoring_v2").in("football_player_id", playerIds),
    admin.from("football_player_fixture_statistics").select("football_player_id,touchline_points,touchline_points_breakdown,rating,statistics_payload,football_fixtures!inner(starts_at)").eq("season_id", state.seasonId).eq("scoring_version", "player_scoring_v2").in("football_player_id", playerIds).order("starts_at", { referencedTable: "football_fixtures", ascending: false }),
  ]);
  if (playerError || squadError || seasonError || fixtureError) return [];
  const players = rows(playerData);
  const clubIds = [...new Set(players.map((player) => text(player.current_club_id)).filter((id): id is string => Boolean(id)))];
  const { data: clubData, error: clubError } = clubIds.length
    ? await admin.from("football_clubs").select("id,name").in("id", clubIds)
    : { data: [], error: null };
  if (clubError) return [];
  const published = await loadTouchlinePublishedCardPresentations({ playerIds, providedAdmin: admin as never });
  const playerById = new Map(players.flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const clubById = new Map(rows(clubData).flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const squadByPlayerId = new Map<string, Row>();
  for (const row of rows(squadData)) {
    const playerId = text(row.player_id);
    if (playerId && !squadByPlayerId.has(playerId)) squadByPlayerId.set(playerId, row);
  }
  const seasonByPlayerId = new Map(rows(seasonData).flatMap((row) => text(row.football_player_id) ? [[text(row.football_player_id)!, row] as const] : []));
  const matchByPlayerId = new Map<string, Row>();
  for (const row of rows(fixtureData)) {
    const playerId = text(row.football_player_id);
    if (playerId && !matchByPlayerId.has(playerId)) matchByPlayerId.set(playerId, row);
  }

  return state.players.flatMap((ranking) => {
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
    const pointContributions = contributions(match);
    return [{
      id: playerId,
      canonicalPlayerId: playerId,
      name,
      shortName: makeArenaShortName(name),
      role: inferArenaRole(position),
      position,
      clubName,
      shirtNumber: normalizeOfficialShirtNumber(squad?.jersey_number),
      countryCode3: countryCode(player),
      marketValue: "",
      marketValueSource: "unavailable" as const,
      marketValueState: "unavailable" as const,
      classificationState: "verified" as const,
      cardTier: editorialCard.tierKey,
      editorialCard,
      touchlinePoints: ranking.touchlinePoints,
      seasonTouchlinePoints: ranking.touchlinePoints,
      matchTouchlinePoints: number(match?.touchline_points),
      seasonStats: verifiedStats(seasonByPlayerId.get(playerId), position),
      matchStats: verifiedMatchStats(match, position),
      ...(pointContributions.length ? { matchPointContributions: pointContributions } : {}),
    }];
  });
}
