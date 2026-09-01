import "server-only";

import type { User } from "@supabase/supabase-js";
import type { TouchlineCoach } from "@/lib/football-data/types";

import { inferArenaRole, makeArenaShortName, normalizeOfficialShirtNumber } from "@/lib/football-data/arena-lineup";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTouchLineActiveRanking } from "@/lib/touchlineArena/card-ranking-server";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";
import {
  hasTouchlineCountryFlag,
  normalizeTouchlineCountryCode3,
  touchlineCountryCode3FromName,
} from "@/lib/touchlineArena/country-flags";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import { createTouchlineArenaCoachSlot, type TouchlineArenaCoachSlot } from "@/lib/touchlineArena/coach-card";
import { formatTouchlineMarketValueEur } from "@/lib/touchlineArena/editorial-card-profile";
import { readTouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry-server";
import type { TouchlineFormationGeometryRegistry } from "@/lib/touchlineArena/formation-geometry";
import {
  TOUCHLINE_LIVE_COACHES,
  touchlineCoachClassificationForProviderId,
} from "@/lib/touchlineArena/live-coaches";
import {
  rankTouchlineFantasyManagers,
  TOUCHLINE_FANTASY_INITIAL_BUDGET_EUR,
  type TouchlineFantasyGameweekState,
  type TouchlineFantasyPublicManagerRank,
} from "./domain";

type Row = Record<string, unknown>;

export type TouchlineFantasyGameweek = Readonly<{
  id: string;
  number: number;
  state: TouchlineFantasyGameweekState;
  marketOpensAt: string;
  locksAt: string;
  firstFixtureAt: string;
  lastFixtureAt: string;
}>;

export type TouchlineFantasySelectionView = Readonly<{
  playerId: string;
  slotId: string;
}>;

export type TouchlineFantasyManagerRank = TouchlineFantasyPublicManagerRank;

export type TouchlineFantasyCoachView = Readonly<{
  id: string;
  coach: TouchlineCoach;
  slot: TouchlineArenaCoachSlot;
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  countryCode3: string;
}>;

export type TouchlineFantasyLineupAlert = Readonly<{
  playerId: string;
  fixtureId: string;
  state: "NOT_SELECTED_ALERT_ELIGIBLE";
  wasEditableAtDetection: boolean;
  detectedAt: string;
}>;

export type TouchlineFantasyMatchHistory = Readonly<{
  fixtureId: string;
  playerId: string;
  rating: number | null;
  goals: number;
  multiplier: 1 | 2;
  contribution: number;
  reason: "RATED_APPEARANCE" | "NO_PROVIDER_RATING" | "DID_NOT_PLAY";
  settlementStatus: "PROVISIONAL" | "FINAL";
}>;

export type TouchlineFantasySnapshot = Readonly<{
  userId: string;
  entitlementActive: boolean;
  subscription: Readonly<{ amountMinor: 2990; currency: "GBP" }>;
  config: Readonly<{
    budgetEur: number;
    maxPlayersPerClub: number;
    lockOffsetMinutes: number;
  }>;
  gameweeks: readonly TouchlineFantasyGameweek[];
  activeGameweek: TouchlineFantasyGameweek | null;
  userGameweek: Readonly<{
    id: string;
    formationCode: string;
    state: "DRAFT" | "CONFIRMED" | "LOCKED" | "FINAL";
    totalMarketValueEur: number;
    carriedFromPrevious: boolean;
    selectedCoachId: string | null;
  }> | null;
  selections: readonly TouchlineFantasySelectionView[];
  catalogue: readonly ClubOwnerSquadCard[];
  coaches: readonly TouchlineFantasyCoachView[];
  lineupAlerts: readonly TouchlineFantasyLineupAlert[];
  formationRegistry: TouchlineFormationGeometryRegistry;
  gameweekScore: number;
  seasonScore: number;
  matchHistory: readonly TouchlineFantasyMatchHistory[];
  gameweekRanking: readonly TouchlineFantasyManagerRank[];
  seasonRanking: readonly TouchlineFantasyManagerRank[];
}>;

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row && typeof row === "object")) : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function countryCode(player: Row) {
  const fromName = touchlineCountryCode3FromName(text(player.nationality));
  if (fromName && hasTouchlineCountryFlag(fromName)) return fromName;
  const stored = normalizeTouchlineCountryCode3(text(player.country_id));
  return hasTouchlineCountryFlag(stored) ? stored : "N/A";
}

function parseGameweek(row: Row): TouchlineFantasyGameweek | null {
  const id = text(row.id);
  const state = text(row.state) as TouchlineFantasyGameweekState | null;
  const gameweekNumber = number(row.gameweek_number);
  const marketOpensAt = text(row.market_opens_at);
  const locksAt = text(row.locks_at);
  const firstFixtureAt = text(row.first_fixture_at);
  const lastFixtureAt = text(row.last_fixture_at);
  if (!id || !state || !gameweekNumber || !marketOpensAt || !locksAt || !firstFixtureAt || !lastFixtureAt) return null;
  return { id, number: gameweekNumber, state, marketOpensAt, locksAt, firstFixtureAt, lastFixtureAt };
}

async function loadCatalogue(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: publicationData, error: publicationError } = await admin
    .from("touchline_card_publications")
    .select("player_id,published_at")
    .eq("publication_status", "published")
    .order("published_at", { ascending: false });
  if (publicationError) return [];
  const playerIds = [...new Set(rows(publicationData).map((row) => text(row.player_id)?.toLowerCase()).filter((id): id is string => Boolean(id)))];
  if (!playerIds.length) return [];

  const [presentations, ranking, playersResponse, membershipsResponse] = await Promise.all([
    loadTouchlinePublishedCardPresentations({ playerIds, providedAdmin: admin }),
    loadTouchLineActiveRanking(),
    admin.from("football_players")
      .select("id,display_name,name,current_club_id,nationality,country_id,position,provider_position,detailed_position")
      .in("id", playerIds),
    admin.from("football_squad_members")
      .select("player_id,club_id,jersey_number,position,detailed_position,status,source_updated_at")
      .eq("status", "active")
      .in("player_id", playerIds)
      .order("source_updated_at", { ascending: false }),
  ]);
  if (playersResponse.error || membershipsResponse.error) return [];

  const players = rows(playersResponse.data);
  const clubIds = [...new Set(players.map((player) => text(player.current_club_id)).filter((id): id is string => Boolean(id)))];
  const clubsResponse = clubIds.length
    ? await admin.from("football_clubs").select("id,name").in("id", clubIds)
    : { data: [], error: null };
  if (clubsResponse.error) return [];
  const clubById = new Map(rows(clubsResponse.data).flatMap((row) => text(row.id) ? [[text(row.id)!, row] as const] : []));
  const membershipByPlayer = new Map<string, Row>();
  for (const membership of rows(membershipsResponse.data)) {
    const playerId = text(membership.player_id)?.toLowerCase();
    if (playerId && !membershipByPlayer.has(playerId)) membershipByPlayer.set(playerId, membership);
  }
  const ratingByPlayer = new Map(
    ranking.phase === "ranked"
      ? ranking.players.map((entry) => [String(entry.playerId).toLowerCase(), entry.totalRating] as const)
      : [],
  );

  return players.flatMap((player): ClubOwnerSquadCard[] => {
    const playerId = text(player.id)?.toLowerCase();
    const presentation = playerId ? presentations.get(playerId) : null;
    const membership = playerId ? membershipByPlayer.get(playerId) : null;
    const currentClubId = text(player.current_club_id);
    if (!playerId || !presentation || presentation.marketValueEur === undefined || !membership || text(membership.club_id) !== currentClubId) return [];
    const name = text(player.display_name) ?? text(player.name);
    const clubName = text(clubById.get(currentClubId ?? "")?.name);
    if (!name || !clubName) return [];
    const position = text(membership.detailed_position) ?? text(membership.position)
      ?? text(player.detailed_position) ?? text(player.provider_position) ?? text(player.position) ?? "Player";
    return [{
      id: playerId,
      canonicalPlayerId: playerId,
      name,
      shortName: makeArenaShortName(name),
      role: inferArenaRole(position),
      position,
      clubName,
      shirtNumber: presentation.shirtNumber ?? normalizeOfficialShirtNumber(membership.jersey_number),
      countryCode3: countryCode(player),
      marketValue: formatTouchlineMarketValueEur(presentation.marketValueEur, "en-GB"),
      marketValueSource: presentation.marketValueState === "provisional" ? "provisional-fallback" : "verified-cache",
      marketValueState: presentation.marketValueState ?? "verified",
      classificationState: presentation.marketValueState === "provisional" ? "provisional" : "verified",
      cardTier: presentation.tierKey,
      editorialCard: presentation,
      touchlinePoints: 0,
      seasonTouchlinePoints: null,
      seasonTotalRating: ratingByPlayer.get(playerId) ?? null,
      matchRating: null,
    }];
  }).sort((first, second) => (
    first.clubName.localeCompare(second.clubName)
      || first.role.localeCompare(second.role)
      || first.name.localeCompare(second.name)
  ));
}

async function loadRankings(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  gameweekId: string,
  seasonId: string,
  viewerUserId: string,
) {
  const { data: userGameweekData, error: userGameweekError } = await admin
    .from("touchline_fantasy_user_gameweeks")
    .select("id,user_id,gameweek_id,touchline_fantasy_gameweeks!inner(season_id)")
    .eq("touchline_fantasy_gameweeks.season_id", seasonId);
  if (userGameweekError) return { gameweek: [], season: [] };
  const userGameweeks = rows(userGameweekData);
  const ids = userGameweeks.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
  const userIds = [...new Set(userGameweeks.map((row) => text(row.user_id)).filter((id): id is string => Boolean(id)))];
  if (!ids.length || !userIds.length) return { gameweek: [], season: [] };
  const [scoresResponse, usersResponse] = await Promise.all([
    admin.from("touchline_fantasy_user_gameweek_scores").select("user_gameweek_id,gameweek_score,settlement_status").in("user_gameweek_id", ids),
    admin.from("users").select("id,full_name").in("id", userIds),
  ]);
  if (scoresResponse.error || usersResponse.error) return { gameweek: [], season: [] };
  const userByGameweek = new Map(userGameweeks.flatMap((row) => text(row.id) && text(row.user_id) ? [[text(row.id)!, row] as const] : []));
  const nameByUser = new Map(rows(usersResponse.data).flatMap((row) => text(row.id) ? [[text(row.id)!, text(row.full_name) ?? "TouchLine Manager"] as const] : []));
  const gameweekValues: Array<{ userId: string; name: string; score: number }> = [];
  const seasonTotals = new Map<string, number>();
  for (const score of rows(scoresResponse.data)) {
    const userGameweek = userByGameweek.get(text(score.user_gameweek_id) ?? "");
    const userId = text(userGameweek?.user_id);
    const value = number(score.gameweek_score) ?? 0;
    if (!userId) continue;
    if (text(score.settlement_status) === "FINAL") {
      seasonTotals.set(userId, (seasonTotals.get(userId) ?? 0) + value);
    }
    if (text(userGameweek?.gameweek_id) === gameweekId) gameweekValues.push({ userId, name: nameByUser.get(userId) ?? "TouchLine Manager", score: value });
  }
  return {
    gameweek: rankTouchlineFantasyManagers(gameweekValues, viewerUserId),
    season: rankTouchlineFantasyManagers(
      [...seasonTotals].map(([userId, score]) => ({ userId, name: nameByUser.get(userId) ?? "TouchLine Manager", score })),
      viewerUserId,
    ),
  };
}

async function loadCoaches(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const teamIds = TOUCHLINE_LIVE_COACHES.map(({ coach }) => coach.teamId);
  const { data, error } = await admin.from("football_clubs")
    .select("id,provider_team_id,name,logo_url")
    .eq("provider", "sportmonks")
    .in("provider_team_id", teamIds);
  if (error) return [];
  const clubByTeamId = new Map(rows(data).flatMap((club) => {
    const teamId = text(club.provider_team_id);
    return teamId ? [[teamId, club] as const] : [];
  }));
  return TOUCHLINE_LIVE_COACHES.flatMap(({ coach, countryCode3 }): TouchlineFantasyCoachView[] => {
    if (!coach.teamId) return [];
    const club = clubByTeamId.get(coach.teamId);
    const clubId = text(club?.id);
    const clubName = text(club?.name);
    const classification = touchlineCoachClassificationForProviderId(coach.providerId);
    if (!clubId || !clubName || !classification) return [];
    return [{
      id: coach.providerId,
      coach,
      slot: createTouchlineArenaCoachSlot(coach, classification.finalPosition, classification.tierKey),
      clubId,
      clubName,
      clubLogoUrl: text(club?.logo_url),
      countryCode3,
    }];
  });
}

export async function loadTouchlineFantasySnapshot(user: User): Promise<TouchlineFantasySnapshot | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  await admin.rpc("touchline_fantasy_sync_gameweeks");
  const [{ data: configData, error: configError }, formationRegistry] = await Promise.all([
    admin.from("touchline_fantasy_configs").select("season_id,budget_eur,max_players_per_club,lock_offset_minutes").eq("competition_key", "england").eq("status", "active").maybeSingle(),
    readTouchlineFormationGeometryRegistry(),
  ]);
  if (configError || !configData) return null;
  const config = configData as Row;
  const seasonId = text(config.season_id);
  if (!seasonId) return null;
  const { data: gameweekData, error: gameweekError } = await admin
    .from("touchline_fantasy_gameweeks")
    .select("id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at")
    .eq("season_id", seasonId)
    .order("gameweek_number", { ascending: true });
  if (gameweekError) return null;
  let gameweeks = rows(gameweekData).map(parseGameweek).filter((entry): entry is TouchlineFantasyGameweek => Boolean(entry));
  let activeGameweek = gameweeks.find((entry) => entry.state === "MARKET_OPEN")
    ?? gameweeks.find((entry) => entry.state === "LIVE" || entry.state === "LOCKED")
    ?? gameweeks.at(-1)
    ?? null;
  if (activeGameweek && !["UPCOMING", "MARKET_OPEN"].includes(activeGameweek.state)) {
    await admin.rpc("touchline_fantasy_reconcile_gameweek", { p_gameweek_id: activeGameweek.id });
    const { data: refreshed } = await admin.from("touchline_fantasy_gameweeks")
      .select("id,gameweek_number,state,market_opens_at,locks_at,first_fixture_at,last_fixture_at")
      .eq("season_id", seasonId)
      .order("gameweek_number", { ascending: true });
    gameweeks = rows(refreshed).map(parseGameweek).filter((entry): entry is TouchlineFantasyGameweek => Boolean(entry));
    activeGameweek = gameweeks.find((entry) => entry.id === activeGameweek?.id) ?? activeGameweek;
  }

  const { data: entitlementData } = await admin.from("touchline_fantasy_entitlements")
    .select("status,current_period_start,current_period_end")
    .eq("user_id", user.id)
    .eq("entitlement_key", "fantasy_access")
    .maybeSingle();
  const entitlement = entitlementData as Row | null;
  const now = Date.now();
  const entitlementActive = text(entitlement?.status) === "active"
    && (!text(entitlement?.current_period_start) || Date.parse(text(entitlement?.current_period_start)!) <= now)
    && (!text(entitlement?.current_period_end) || Date.parse(text(entitlement?.current_period_end)!) > now);
  if (entitlementActive && activeGameweek?.state === "MARKET_OPEN") {
    await admin.rpc("touchline_fantasy_prepare_user_gameweek", { p_user_id: user.id, p_gameweek_id: activeGameweek.id });
  }

  const [catalogue, coaches, userGameweekResponse, rankings] = await Promise.all([
    loadCatalogue(admin),
    loadCoaches(admin),
    activeGameweek
      ? admin.from("touchline_fantasy_user_gameweeks")
        .select("id,formation_code,selected_coach_id,locked_coach_id,state,total_market_value_eur,carry_source_user_gameweek_id")
        .eq("user_id", user.id)
        .eq("gameweek_id", activeGameweek.id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    activeGameweek ? loadRankings(admin, activeGameweek.id, seasonId, user.id) : Promise.resolve({ gameweek: [], season: [] }),
  ]);
  const userGameweekRow = userGameweekResponse.data as Row | null;
  const userGameweekId = text(userGameweekRow?.id);
  if (activeGameweek && userGameweekId) {
    await admin.rpc("touchline_fantasy_reconcile_lineup_alerts", { p_gameweek_id: activeGameweek.id });
  }
  const [draftResponse, lockedResponse, scoreResponse, seasonScoresResponse, alertsResponse] = userGameweekId
    ? await Promise.all([
      admin.from("touchline_fantasy_user_gameweek_selections").select("player_id,slot_id").eq("user_gameweek_id", userGameweekId),
      admin.from("touchline_fantasy_locked_selections").select("player_id,slot_id").eq("user_gameweek_id", userGameweekId),
      admin.from("touchline_fantasy_user_gameweek_scores").select("gameweek_score").eq("user_gameweek_id", userGameweekId).maybeSingle(),
      admin.from("touchline_fantasy_user_gameweek_scores").select("gameweek_score,settlement_status,touchline_fantasy_user_gameweeks!inner(user_id,touchline_fantasy_gameweeks!inner(season_id))")
        .eq("touchline_fantasy_user_gameweeks.user_id", user.id)
        .eq("touchline_fantasy_user_gameweeks.touchline_fantasy_gameweeks.season_id", seasonId),
      admin.from("touchline_fantasy_lineup_alerts")
        .select("player_id,fixture_id,state,was_editable_at_detection,detected_at")
        .eq("user_gameweek_id", userGameweekId)
        .order("detected_at", { ascending: false }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: null, error: null }, { data: [], error: null }, { data: [], error: null }];
  const selectionRows = rows(lockedResponse.data).length ? rows(lockedResponse.data) : rows(draftResponse.data);
  const selections = selectionRows.flatMap((row): TouchlineFantasySelectionView[] => {
    const playerId = text(row.player_id);
    const slotId = text(row.slot_id);
    return playerId && slotId ? [{ playerId, slotId }] : [];
  });
  const selectedPlayerIds = selections.map((entry) => entry.playerId);
  const { data: historyData } = activeGameweek && selectedPlayerIds.length
    ? await admin.from("touchline_fantasy_player_fixture_scores")
      .select("fixture_id,player_id,rating,goals,hat_trick_multiplier,fantasy_contribution,reason_code,settlement_status")
      .eq("gameweek_id", activeGameweek.id)
      .in("player_id", selectedPlayerIds)
    : { data: [] };
  const matchHistory = rows(historyData).flatMap((row): TouchlineFantasyMatchHistory[] => {
    const fixtureId = text(row.fixture_id);
    const playerId = text(row.player_id);
    const reason = text(row.reason_code) as TouchlineFantasyMatchHistory["reason"] | null;
    const status = text(row.settlement_status) as TouchlineFantasyMatchHistory["settlementStatus"] | null;
    if (!fixtureId || !playerId || !reason || !status) return [];
    return [{
      fixtureId,
      playerId,
      rating: number(row.rating),
      goals: number(row.goals) ?? 0,
      multiplier: number(row.hat_trick_multiplier) === 2 ? 2 : 1,
      contribution: number(row.fantasy_contribution) ?? 0,
      reason,
      settlementStatus: status,
    }];
  });
  const lineupAlerts = rows(alertsResponse.data).flatMap((row): TouchlineFantasyLineupAlert[] => {
    const playerId = text(row.player_id);
    const fixtureId = text(row.fixture_id);
    const detectedAt = text(row.detected_at);
    if (!playerId || !fixtureId || !detectedAt || text(row.state) !== "NOT_SELECTED_ALERT_ELIGIBLE") return [];
    return [{
      playerId,
      fixtureId,
      state: "NOT_SELECTED_ALERT_ELIGIBLE",
      wasEditableAtDetection: row.was_editable_at_detection === true,
      detectedAt,
    }];
  });

  return {
    userId: user.id,
    entitlementActive,
    subscription: { amountMinor: 2990, currency: "GBP" },
    config: {
      budgetEur: number(config.budget_eur) ?? TOUCHLINE_FANTASY_INITIAL_BUDGET_EUR,
      maxPlayersPerClub: number(config.max_players_per_club) ?? 11,
      lockOffsetMinutes: number(config.lock_offset_minutes) ?? 5,
    },
    gameweeks,
    activeGameweek,
    userGameweek: userGameweekId ? {
      id: userGameweekId,
      formationCode: text(userGameweekRow?.formation_code) ?? "4-3-3",
      state: (text(userGameweekRow?.state) ?? "DRAFT") as "DRAFT" | "CONFIRMED" | "LOCKED" | "FINAL",
      totalMarketValueEur: number(userGameweekRow?.total_market_value_eur) ?? 0,
      carriedFromPrevious: Boolean(text(userGameweekRow?.carry_source_user_gameweek_id)),
      selectedCoachId: text(userGameweekRow?.locked_coach_id) ?? text(userGameweekRow?.selected_coach_id),
    } : null,
    selections,
    catalogue,
    coaches,
    lineupAlerts,
    formationRegistry,
    gameweekScore: number((scoreResponse.data as Row | null)?.gameweek_score) ?? 0,
    seasonScore: rows(seasonScoresResponse.data)
      .filter((row) => text(row.settlement_status) === "FINAL")
      .reduce((sum, row) => sum + (number(row.gameweek_score) ?? 0), 0),
    matchHistory,
    gameweekRanking: rankings.gameweek,
    seasonRanking: rankings.season,
  };
}
