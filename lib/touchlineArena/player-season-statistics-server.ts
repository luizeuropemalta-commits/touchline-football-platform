import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  emptyTouchLinePlayerSeasonStatistics,
  normalizeTouchLinePlayerSeasonStatistics,
  type TouchLinePlayerFixtureStatistics,
  type TouchLinePlayerSeasonStatistics,
  type TouchLinePlayerStatisticsReadModel,
} from "@/lib/touchlineArena/player-season-statistics";

const TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID = "8";

type PlayerRow = {
  id: string;
  provider: string;
  provider_player_id: string;
  current_club_id: string | null;
  football_clubs?: { id?: string; name?: string | null } | null;
};

type CompetitionRow = { id: string; name: string };
type SeasonRow = { id: string; name: string; ends_at: string | null; is_current: boolean };
type SeasonStatisticRow = {
  season_id: string;
  club_id: string | null;
  coverage_status: string;
  expected_fixture_count: number | null;
  synchronized_fixture_count: number;
  expected_fixture_ids: unknown;
  aggregated_fixture_ids: unknown;
  summary_payload: unknown;
  position_statistics_payload: unknown;
  source_synced_at: string | null;
  football_clubs?: { id?: string; name?: string | null } | null;
};
type FixtureStatisticRow = {
  fixture_id: string;
  appearance_status: TouchLinePlayerFixtureStatistics["appearanceStatus"];
  minutes_played: number | null;
  rating: number | null;
  statistics_payload: unknown;
  source_synced_at: string | null;
  football_fixtures?: {
    provider_fixture_id?: string | null;
    starts_at?: string | null;
    status?: string | null;
    home_club_id?: string | null;
    away_club_id?: string | null;
  } | null;
};

function record(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries: Array<[string, number | string]> = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === "number" && Number.isFinite(nested)) entries.push([key, nested]);
    else if (typeof nested === "string" && nested.trim()) entries.push([key, nested]);
  }
  return Object.fromEntries(entries);
}

function emptyReadModel(providerPlayerId: string | null): TouchLinePlayerStatisticsReadModel {
  return {
    touchlinePlayerId: null,
    providerPlayerId,
    mappingStatus: "unavailable",
    previousCompletedSeason: emptyTouchLinePlayerSeasonStatistics({ unavailableReason: "mapping-not-verified" }),
    currentSeason: emptyTouchLinePlayerSeasonStatistics({ unavailableReason: "mapping-not-verified" }),
    lastFiveMatches: [],
    currentOrSelectedFixture: null,
  };
}

function fixtureStatisticFromRow(row: FixtureStatisticRow): TouchLinePlayerFixtureStatistics {
  const fixture = row.football_fixtures;
  return {
    fixtureId: fixture?.provider_fixture_id ?? row.fixture_id,
    fixtureName: null,
    fixtureStartsAt: fixture?.starts_at ?? null,
    fixtureStatus: fixture?.status ?? null,
    appearanceStatus: row.appearance_status,
    minutes: row.minutes_played,
    rating: row.rating === null ? null : Number(row.rating),
    statistics: record(row.statistics_payload),
    latestSyncAt: row.source_synced_at,
  };
}

function seasonReadModel(input: {
  row?: SeasonStatisticRow;
  season?: SeasonRow;
  competition?: CompetitionRow;
  player?: PlayerRow;
}): TouchLinePlayerSeasonStatistics {
  const { row, season, competition, player } = input;
  if (!row) {
    return emptyTouchLinePlayerSeasonStatistics({
      seasonId: season?.id,
      seasonName: season?.name,
      competitionId: competition?.id,
      competitionName: competition?.name,
      clubId: player?.current_club_id,
      clubName: player?.football_clubs?.name ?? null,
      unavailableReason: season ? "not-synchronised" : "season-not-known",
    });
  }
  return normalizeTouchLinePlayerSeasonStatistics({
    coverageStatus: row.coverage_status,
    seasonId: season?.id ?? row.season_id,
    seasonName: season?.name,
    competitionId: competition?.id,
    competitionName: competition?.name,
    clubId: row.club_id,
    clubName: row.football_clubs?.name ?? player?.football_clubs?.name ?? null,
    expectedFixtureCount: row.expected_fixture_count,
    synchronizedFixtureCount: row.synchronized_fixture_count,
    expectedFixtureIds: row.expected_fixture_ids,
    aggregatedFixtureIds: row.aggregated_fixture_ids,
    summaryPayload: row.summary_payload,
    positionStatisticsPayload: row.position_statistics_payload,
    latestSyncAt: row.source_synced_at,
  });
}

async function readPlayer(admin: SupabaseClient, providerPlayerId: string) {
  const { data, error } = await admin
    .from("football_players")
    .select("id,provider,provider_player_id,current_club_id,football_clubs(id,name)")
    .eq("provider", "sportmonks")
    .eq("provider_player_id", providerPlayerId)
    .maybeSingle();
  return error || !data ? null : data as PlayerRow;
}

async function readCompetition(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("football_competitions")
    .select("id,name")
    .eq("provider", "sportmonks")
    .eq("provider_competition_id", TOUCHLINE_ENGLAND_COMPETITION_PROVIDER_ID)
    .maybeSingle();
  return error || !data ? null : data as CompetitionRow;
}

async function readSeasons(admin: SupabaseClient, competitionId: string) {
  const { data, error } = await admin
    .from("football_seasons")
    .select("id,name,ends_at,is_current")
    .eq("competition_id", competitionId)
    .order("ends_at", { ascending: false });
  return error || !Array.isArray(data) ? [] as SeasonRow[] : data as SeasonRow[];
}

async function readSeasonRows(admin: SupabaseClient, playerId: string, competitionId: string) {
  const { data, error } = await admin
    .from("football_player_season_statistics")
    .select("season_id,club_id,coverage_status,expected_fixture_count,synchronized_fixture_count,expected_fixture_ids,aggregated_fixture_ids,summary_payload,position_statistics_payload,source_synced_at,football_clubs(id,name)")
    .eq("football_player_id", playerId)
    .eq("competition_id", competitionId);
  return error || !Array.isArray(data) ? [] as SeasonStatisticRow[] : data as SeasonStatisticRow[];
}

async function readFixtureRows(admin: SupabaseClient, input: { playerId: string; competitionId: string; selectedFixtureId?: string | null }) {
  let query = admin
    .from("football_player_fixture_statistics")
    .select("fixture_id,appearance_status,minutes_played,rating,statistics_payload,source_synced_at,football_fixtures!inner(provider_fixture_id,starts_at,status,competition_id,home_club_id,away_club_id)")
    .eq("football_player_id", input.playerId)
    .eq("football_fixtures.competition_id", input.competitionId)
    .limit(input.selectedFixtureId ? 1 : 120);
  if (input.selectedFixtureId) query = query.eq("football_fixtures.provider_fixture_id", input.selectedFixtureId);
  const { data, error } = await query;
  return error || !Array.isArray(data) ? [] as FixtureStatisticRow[] : data as FixtureStatisticRow[];
}

async function readCurrentFixture(admin: SupabaseClient, input: { clubId: string | null; competitionId: string; selectedFixtureId?: string | null }) {
  if (!input.clubId && !input.selectedFixtureId) return null;
  let query = admin
    .from("football_fixtures")
    .select("id,provider_fixture_id,starts_at,status")
    .eq("competition_id", input.competitionId)
    .order("starts_at", { ascending: true })
    .limit(1);
  if (input.selectedFixtureId) query = query.eq("provider_fixture_id", input.selectedFixtureId);
  else query = query.or(`home_club_id.eq.${input.clubId},away_club_id.eq.${input.clubId}`).gte("starts_at", new Date().toISOString());
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as { id: string; provider_fixture_id: string; starts_at: string | null; status: string | null };
}

/**
 * The only server reader exposed to product surfaces. It intentionally never
 * calls an external football API and never derives totals in a page.
 */
export async function loadTouchLinePlayerStatisticsReadModel(input: {
  providerPlayerId?: string | null;
  selectedFixtureId?: string | null;
}): Promise<TouchLinePlayerStatisticsReadModel> {
  const providerPlayerId = String(input.providerPlayerId ?? "").trim();
  if (!/^\d+$/.test(providerPlayerId)) return emptyReadModel(null);
  const admin = createAdminClient();
  if (!admin) return emptyReadModel(providerPlayerId);

  const [player, competition] = await Promise.all([
    readPlayer(admin, providerPlayerId),
    readCompetition(admin),
  ]);
  if (!player || !competition || player.provider_player_id !== providerPlayerId) return emptyReadModel(providerPlayerId);

  const seasons = await readSeasons(admin, competition.id);
  const now = new Date().toISOString().slice(0, 10);
  const currentSeason = seasons.find((season) => season.is_current) ?? null;
  const previousCompletedSeason = seasons.find((season) => Boolean(season.ends_at && season.ends_at < now && !season.is_current)) ?? null;
  const [seasonRows, fixtureRows, currentFixture] = await Promise.all([
    readSeasonRows(admin, player.id, competition.id),
    readFixtureRows(admin, { playerId: player.id, competitionId: competition.id, selectedFixtureId: input.selectedFixtureId }),
    readCurrentFixture(admin, { clubId: player.current_club_id, competitionId: competition.id, selectedFixtureId: input.selectedFixtureId }),
  ]);
  const seasonRowsById = new Map(seasonRows.map((row) => [row.season_id, row]));
  const allFixtures = fixtureRows
    .map(fixtureStatisticFromRow)
    .sort((first, second) => Date.parse(second.fixtureStartsAt ?? "") - Date.parse(first.fixtureStartsAt ?? ""));
  const selectedFixtureStatistic = allFixtures.find((fixture) => fixture.fixtureId === currentFixture?.provider_fixture_id) ?? null;
  const currentOrSelectedFixture = selectedFixtureStatistic ?? (currentFixture ? {
    fixtureId: currentFixture.provider_fixture_id,
    fixtureName: null,
    fixtureStartsAt: currentFixture.starts_at,
    fixtureStatus: currentFixture.status,
    appearanceStatus: "unavailable" as const,
    minutes: null,
    rating: null,
    statistics: {},
    latestSyncAt: null,
  } satisfies TouchLinePlayerFixtureStatistics : null);

  return {
    touchlinePlayerId: player.id,
    providerPlayerId,
    mappingStatus: "verified",
    previousCompletedSeason: seasonReadModel({
      row: previousCompletedSeason ? seasonRowsById.get(previousCompletedSeason.id) : undefined,
      season: previousCompletedSeason ?? undefined,
      competition,
      player,
    }),
    currentSeason: seasonReadModel({
      row: currentSeason ? seasonRowsById.get(currentSeason.id) : undefined,
      season: currentSeason ?? undefined,
      competition,
      player,
    }),
    lastFiveMatches: input.selectedFixtureId ? [] : allFixtures.slice(0, 5),
    currentOrSelectedFixture,
  };
}
