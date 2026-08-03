import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FootballDataProviderName,
  TouchlineCompetition,
  TouchlineFixture,
  TouchlineSeason,
  TouchlineTeam,
} from "@/lib/football-data/types";

const DEFAULT_PROVIDER = "sportmonks" as const;
const DEFAULT_COMPETITION_PROVIDER_ID = "8";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 240;

type DatabaseRecord = Record<string, unknown>;
type FixtureAdminClient = SupabaseClient;

type FixtureRow = {
  provider?: unknown;
  provider_fixture_id?: unknown;
  starts_at?: unknown;
  status?: unknown;
  home_score?: unknown;
  away_score?: unknown;
  home_club_id?: unknown;
  away_club_id?: unknown;
  source_updated_at?: unknown;
};

function asString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNullableInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function asTimestamp(value: unknown) {
  const text = asString(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function withoutRawTeam(team: TouchlineTeam): TouchlineTeam {
  return {
    ...team,
    source: {
      provider: team.source.provider,
      providerId: team.source.providerId,
      externalUrl: team.source.externalUrl,
      lastSyncedAt: team.source.lastSyncedAt,
    },
  };
}

function fixtureTeamFromClub(row: DatabaseRecord | undefined, provider: FootballDataProviderName): TouchlineTeam | undefined {
  if (!row) return undefined;
  const providerId = asString(row.provider_team_id);
  const name = asString(row.name);
  if (!providerId || !name) return undefined;
  return {
    id: `${provider}:${providerId}`,
    providerId,
    provider,
    name,
    shortCode: asString(row.short_code) ?? undefined,
    logoUrl: asString(row.logo_url) ?? undefined,
    country: asString(row.country) ?? undefined,
    countryId: asString(row.country_id) ?? undefined,
    founded: asNullableInteger(row.founded) ?? undefined,
    venueId: asString(row.venue_id) ?? undefined,
    source: { provider, providerId, lastSyncedAt: asTimestamp(row.source_updated_at) ?? undefined },
  };
}

function fixtureFromRow(row: FixtureRow, clubsById: Map<string, DatabaseRecord>): TouchlineFixture | null {
  const provider = asString(row.provider);
  const providerId = asString(row.provider_fixture_id);
  if (provider !== "sportmonks" || !providerId) return null;
  const homeClub = clubsById.get(asString(row.home_club_id) ?? "");
  const awayClub = clubsById.get(asString(row.away_club_id) ?? "");
  const homeTeam = fixtureTeamFromClub(homeClub, provider);
  const awayTeam = fixtureTeamFromClub(awayClub, provider);
  if (!homeTeam || !awayTeam) return null;
  return {
    id: `${provider}:${providerId}`,
    providerId,
    provider,
    name: `${homeTeam.name} vs ${awayTeam.name}`,
    startsAt: asTimestamp(row.starts_at) ?? undefined,
    status: asString(row.status) ?? undefined,
    homeTeam,
    awayTeam,
    homeScore: asNullableInteger(row.home_score) ?? undefined,
    awayScore: asNullableInteger(row.away_score) ?? undefined,
    source: {
      provider,
      providerId,
      lastSyncedAt: asTimestamp(row.source_updated_at) ?? undefined,
    },
  };
}

/** Server-only schedule read shared by ClubHub, Arena and TouchLine Live. */
export async function readPublicCompetitionFixtures(options: {
  provider?: FootballDataProviderName;
  competitionProviderId?: string;
  limit?: number;
  now?: number;
  /** Match Centre uses the durable archive as well as the current schedule. */
  includeHistorical?: boolean;
} = {}) {
  const admin = createAdminClient();
  if (!admin) return [] as TouchlineFixture[];

  const provider = options.provider ?? DEFAULT_PROVIDER;
  const competitionProviderId = options.competitionProviderId ?? DEFAULT_COMPETITION_PROVIDER_ID;
  const requestedLimit = Number.isFinite(options.limit) ? Math.trunc(options.limit ?? DEFAULT_LIMIT) : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit));
  const now = options.now ?? Date.now();
  const from = new Date(now - 4 * 60 * 60 * 1_000).toISOString();

  const { data: competition, error: competitionError } = await admin
    .from("football_competitions")
    .select("id")
    .eq("provider", provider)
    .eq("provider_competition_id", competitionProviderId)
    .maybeSingle();
  if (competitionError || !competition?.id) return [] as TouchlineFixture[];

  let fixtureQuery = admin
    .from("football_fixtures")
    .select("provider,provider_fixture_id,starts_at,status,home_score,away_score,home_club_id,away_club_id,source_updated_at")
    .eq("provider", provider)
    .eq("competition_id", competition.id)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (!options.includeHistorical) fixtureQuery = fixtureQuery.gte("starts_at", from);
  const { data: fixtureRows, error: fixturesError } = await fixtureQuery;
  if (fixturesError || !Array.isArray(fixtureRows) || !fixtureRows.length) return [] as TouchlineFixture[];

  const clubIds = [...new Set((fixtureRows as FixtureRow[])
    .flatMap((row) => [asString(row.home_club_id), asString(row.away_club_id)])
    .filter((id): id is string => Boolean(id)))];
  if (!clubIds.length) return [] as TouchlineFixture[];

  const { data: clubs, error: clubsError } = await admin
    .from("football_clubs")
    .select("id,provider_team_id,name,short_code,logo_url,country,country_id,founded,venue_id,source_updated_at")
    .in("id", clubIds);
  if (clubsError || !Array.isArray(clubs)) return [] as TouchlineFixture[];

  const clubsById = new Map((clubs as DatabaseRecord[])
    .map((club) => [asString(club.id), club] as const)
    .filter((entry): entry is [string, DatabaseRecord] => Boolean(entry[0])));
  return (fixtureRows as FixtureRow[])
    .map((row) => fixtureFromRow(row, clubsById))
    .filter((fixture): fixture is TouchlineFixture => Boolean(fixture));
}

function uniqueTeams(fixtures: TouchlineFixture[]) {
  const teams = new Map<string, TouchlineTeam>();
  for (const fixture of fixtures) {
    for (const team of [fixture.homeTeam, fixture.awayTeam]) {
      if (team?.providerId) teams.set(team.providerId, withoutRawTeam(team));
    }
  }
  return [...teams.values()];
}

export async function persistCompetitionFixtureSchedule(
  admin: FixtureAdminClient,
  input: {
    competition: TouchlineCompetition;
    seasons: TouchlineSeason[];
    fixtures: TouchlineFixture[];
    syncedAt: string;
  },
) {
  const { competition, seasons, fixtures, syncedAt } = input;
  const timestamp = asTimestamp(syncedAt) ?? new Date().toISOString();
  const { data: persistedCompetition, error: competitionError } = await admin
    .from("football_competitions")
    .upsert({
      provider: competition.provider,
      provider_competition_id: competition.providerId,
      name: competition.name,
      type: competition.type ?? null,
      logo_url: competition.logoUrl ?? null,
      country: competition.country ?? null,
      country_id: competition.countryId ?? null,
      source_updated_at: timestamp,
    }, { onConflict: "provider,provider_competition_id" })
    .select("id")
    .single();
  if (competitionError || !persistedCompetition?.id) {
    return { stored: false as const, reason: competitionError?.message ?? "competition-upsert-failed", fixturesStored: 0 };
  }

  const relevantSeasonIds = new Set(fixtures.map((fixture) => fixture.seasonId).filter(Boolean));
  const relevantSeasons = seasons.filter((season) => relevantSeasonIds.has(season.providerId));
  if (relevantSeasons.length) {
    const { error } = await admin.from("football_seasons").upsert(relevantSeasons.map((season) => ({
      provider: season.provider,
      provider_season_id: season.providerId,
      competition_id: persistedCompetition.id,
      name: season.name,
      starts_at: season.startsAt ?? null,
      ends_at: season.endsAt ?? null,
      is_current: season.isCurrent,
      source_updated_at: timestamp,
    })), { onConflict: "provider,provider_season_id" });
    if (error) return { stored: false as const, reason: error.message, fixturesStored: 0 };
  }

  const teams = uniqueTeams(fixtures);
  if (teams.length) {
    const { error } = await admin.from("football_clubs").upsert(teams.map((team) => ({
      provider: team.provider,
      provider_team_id: team.providerId,
      competition_id: persistedCompetition.id,
      name: team.name,
      short_code: team.shortCode ?? null,
      logo_url: team.logoUrl ?? null,
      country: team.country ?? null,
      country_id: team.countryId ?? null,
      founded: team.founded ?? null,
      venue_id: team.venueId ?? null,
      source_updated_at: timestamp,
    })), { onConflict: "provider,provider_team_id" });
    if (error) return { stored: false as const, reason: error.message, fixturesStored: 0 };
  }

  const [{ data: persistedSeasons, error: seasonsError }, { data: persistedClubs, error: clubsError }] = await Promise.all([
    admin.from("football_seasons").select("id,provider_season_id").eq("provider", competition.provider),
    admin.from("football_clubs").select("id,provider_team_id").eq("provider", competition.provider),
  ]);
  if (seasonsError || clubsError) {
    return { stored: false as const, reason: seasonsError?.message ?? clubsError?.message ?? "fixture-relations-unavailable", fixturesStored: 0 };
  }
  const seasonsByProviderId = new Map((persistedSeasons as DatabaseRecord[] ?? []).map((season) => [asString(season.provider_season_id), asString(season.id)]));
  const clubsByProviderId = new Map((persistedClubs as DatabaseRecord[] ?? []).map((club) => [asString(club.provider_team_id), asString(club.id)]));
  const rows = fixtures.flatMap((fixture) => {
    const homeClubId = clubsByProviderId.get(fixture.homeTeam?.providerId ?? "");
    const awayClubId = clubsByProviderId.get(fixture.awayTeam?.providerId ?? "");
    if (!homeClubId || !awayClubId || !fixture.startsAt) return [];
    return [{
      provider: fixture.provider,
      provider_fixture_id: fixture.providerId,
      competition_id: persistedCompetition.id,
      season_id: fixture.seasonId ? seasonsByProviderId.get(fixture.seasonId) ?? null : null,
      home_club_id: homeClubId,
      away_club_id: awayClubId,
      starts_at: fixture.startsAt,
      status: fixture.status ?? null,
      home_score: fixture.homeScore ?? null,
      away_score: fixture.awayScore ?? null,
      source_updated_at: timestamp,
    }];
  });
  if (!rows.length) return { stored: true as const, fixturesStored: 0 };
  const { error: fixturesError } = await admin.from("football_fixtures").upsert(rows, { onConflict: "provider,provider_fixture_id" });
  return fixturesError
    ? { stored: false as const, reason: fixturesError.message, fixturesStored: 0 }
    : { stored: true as const, fixturesStored: rows.length };
}
