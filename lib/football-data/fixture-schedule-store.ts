import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { touchlineCompetitionCoachAssignments } from "@/lib/touchlineArena/live-coaches";
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
  competition_id?: unknown;
  season_id?: unknown;
  round_id?: unknown;
  starts_at?: unknown;
  status?: unknown;
  home_score?: unknown;
  away_score?: unknown;
  home_club_id?: unknown;
  away_club_id?: unknown;
  source_updated_at?: unknown;
  provider_state_id?: unknown;
  live_minute?: unknown;
  live_second?: unknown;
  live_period?: unknown;
  events_count?: unknown;
  provider_updated_at?: unknown;
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

/**
 * The normalized fixture table is shared with QA fixtures used by visual
 * scenarios. A public football surface may only expose a fixture that has a
 * real Sportmonks primary key; descriptive QA identifiers must never cross
 * this provider boundary.
 */
export function isOfficialSportmonksFixtureId(value: unknown): value is string {
  const providerId = asString(value);
  return Boolean(providerId && /^[1-9]\d{0,19}$/.test(providerId));
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

function fixtureFromRow(
  row: FixtureRow,
  clubsById: Map<string, DatabaseRecord>,
  seasonsById: Map<string, DatabaseRecord>,
  roundsById: Map<string, DatabaseRecord>,
  competitionProviderId: string,
): TouchlineFixture | null {
  const provider = asString(row.provider);
  const providerId = asString(row.provider_fixture_id);
  if (provider !== "sportmonks" || !isOfficialSportmonksFixtureId(providerId)) return null;
  const homeClub = clubsById.get(asString(row.home_club_id) ?? "");
  const awayClub = clubsById.get(asString(row.away_club_id) ?? "");
  const homeTeam = fixtureTeamFromClub(homeClub, provider);
  const awayTeam = fixtureTeamFromClub(awayClub, provider);
  if (!homeTeam || !awayTeam) return null;
  const season = seasonsById.get(asString(row.season_id) ?? "");
  const round = roundsById.get(asString(row.round_id) ?? "");
  return {
    id: `${provider}:${providerId}`,
    providerId,
    provider,
    name: `${homeTeam.name} vs ${awayTeam.name}`,
    startsAt: asTimestamp(row.starts_at) ?? undefined,
    status: asString(row.status) ?? undefined,
    competitionId: competitionProviderId,
    seasonId: asString(season?.provider_season_id) ?? undefined,
    roundId: asString(round?.provider_round_id) ?? undefined,
    roundName: asString(round?.name) ?? undefined,
    homeTeam,
    awayTeam,
    homeScore: asNullableInteger(row.home_score) ?? undefined,
    awayScore: asNullableInteger(row.away_score) ?? undefined,
    providerStateId: asString(row.provider_state_id) ?? undefined,
    liveMinute: asNullableInteger(row.live_minute) ?? undefined,
    liveSecond: asNullableInteger(row.live_second) ?? undefined,
    livePeriod: asString(row.live_period) ?? undefined,
    eventsCount: asNullableInteger(row.events_count) ?? undefined,
    providerUpdatedAt: asTimestamp(row.provider_updated_at) ?? undefined,
    source: {
      provider,
      providerId,
      lastSyncedAt: asTimestamp(row.source_updated_at) ?? undefined,
    },
  };
}

/**
 * Exact server-only fixture read for workflows that already possess one
 * verified provider fixture identity. Unlike the bounded schedule reader,
 * this query never enumerates the season, so fixture 380 is as reachable as
 * fixture 1 and an unrelated historical window cannot hide the target.
 */
export async function readPublicCompetitionFixtureByProviderId(
  providerFixtureId: string,
  options: Readonly<{
    provider?: FootballDataProviderName;
    competitionProviderId?: string;
    providedAdmin?: FixtureAdminClient;
  }> = {},
) {
  if (!isOfficialSportmonksFixtureId(providerFixtureId)) return null;
  const admin = options.providedAdmin ?? createAdminClient();
  if (!admin) return null;

  const provider = options.provider ?? DEFAULT_PROVIDER;
  const competitionProviderId = options.competitionProviderId ?? DEFAULT_COMPETITION_PROVIDER_ID;
  const { data: competition, error: competitionError } = await admin
    .from("football_competitions")
    .select("id")
    .eq("provider", provider)
    .eq("provider_competition_id", competitionProviderId)
    .maybeSingle();
  if (competitionError || !competition?.id) return null;

  const { data: fixtureRows, error: fixtureError } = await admin
    .from("football_fixtures")
    .select("provider,provider_fixture_id,competition_id,season_id,round_id,starts_at,status,home_score,away_score,home_club_id,away_club_id,source_updated_at,provider_state_id,live_minute,live_second,live_period,events_count,provider_updated_at")
    .eq("provider", provider)
    .eq("competition_id", competition.id)
    .eq("provider_fixture_id", providerFixtureId)
    .limit(2);
  if (fixtureError || !Array.isArray(fixtureRows) || fixtureRows.length !== 1) return null;

  const row = fixtureRows[0] as FixtureRow;
  const clubIds = [asString(row.home_club_id), asString(row.away_club_id)]
    .filter((id): id is string => Boolean(id));
  const seasonId = asString(row.season_id);
  const roundId = asString(row.round_id);
  if (clubIds.length !== 2 || new Set(clubIds).size !== 2 || !seasonId || !roundId) return null;

  const [{ data: clubs, error: clubsError }, seasonResult, roundResult] = await Promise.all([
    admin
      .from("football_clubs")
      .select("id,provider_team_id,name,short_code,logo_url,country,country_id,founded,venue_id,source_updated_at")
      .in("id", clubIds),
    admin.from("football_seasons").select("id,provider_season_id").eq("id", seasonId).maybeSingle(),
    admin.from("football_rounds").select("id,provider_round_id,name").eq("id", roundId).maybeSingle(),
  ]);
  if (clubsError || seasonResult.error || roundResult.error
    || !Array.isArray(clubs) || clubs.length !== 2 || !seasonResult.data || !roundResult.data) return null;

  const clubsById = new Map((clubs as DatabaseRecord[])
    .map((club) => [asString(club.id), club] as const)
    .filter((entry): entry is [string, DatabaseRecord] => Boolean(entry[0])));
  const seasonsById = new Map([[seasonId, seasonResult.data as DatabaseRecord]]);
  const roundsById = new Map([[roundId, roundResult.data as DatabaseRecord]]);
  return fixtureFromRow(row, clubsById, seasonsById, roundsById, competitionProviderId);
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
    .select("provider,provider_fixture_id,competition_id,season_id,round_id,starts_at,status,home_score,away_score,home_club_id,away_club_id,source_updated_at,provider_state_id,live_minute,live_second,live_period,events_count,provider_updated_at")
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

  const seasonIds = [...new Set((fixtureRows as FixtureRow[])
    .map((row) => asString(row.season_id))
    .filter((id): id is string => Boolean(id)))];
  const roundIds = [...new Set((fixtureRows as FixtureRow[])
    .map((row) => asString(row.round_id))
    .filter((id): id is string => Boolean(id)))];

  const [{ data: clubs, error: clubsError }, seasonsResult, roundsResult] = await Promise.all([
    admin
      .from("football_clubs")
      .select("id,provider_team_id,name,short_code,logo_url,country,country_id,founded,venue_id,source_updated_at")
      .in("id", clubIds),
    seasonIds.length
      ? admin.from("football_seasons").select("id,provider_season_id").in("id", seasonIds)
      : Promise.resolve({ data: [], error: null }),
    roundIds.length
      ? admin.from("football_rounds").select("id,provider_round_id,name").in("id", roundIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    clubsError
    || seasonsResult.error
    || roundsResult.error
    || !Array.isArray(clubs)
    || !Array.isArray(seasonsResult.data)
    || !Array.isArray(roundsResult.data)
  ) return [] as TouchlineFixture[];

  const clubsById = new Map((clubs as DatabaseRecord[])
    .map((club) => [asString(club.id), club] as const)
    .filter((entry): entry is [string, DatabaseRecord] => Boolean(entry[0])));
  const seasonsById = new Map((seasonsResult.data as DatabaseRecord[])
    .map((season) => [asString(season.id), season] as const)
    .filter((entry): entry is [string, DatabaseRecord] => Boolean(entry[0])));
  const roundsById = new Map((roundsResult.data as DatabaseRecord[])
    .map((round) => [asString(round.id), round] as const)
    .filter((entry): entry is [string, DatabaseRecord] => Boolean(entry[0])));
  return (fixtureRows as FixtureRow[])
    .map((row) => fixtureFromRow(row, clubsById, seasonsById, roundsById, competitionProviderId))
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
  const requestedRoundProviderIds = new Set<string>();
  const roundsByProviderIdInput = new Map<string, DatabaseRecord>();
  for (const fixture of fixtures) {
    const roundProviderId = asString(fixture.roundId);
    const seasonId = fixture.seasonId ? seasonsByProviderId.get(fixture.seasonId) : null;
    if (!roundProviderId || !seasonId) continue;
    requestedRoundProviderIds.add(roundProviderId);
    const roundName = asString(fixture.roundName);
    // A partial provider response may keep round_id but omit its included
    // relation. Reuse an existing verified row in that case; never erase its
    // name with null and never invent a matchweek label.
    if (!roundName) continue;
    roundsByProviderIdInput.set(roundProviderId, {
      provider: fixture.provider,
      provider_round_id: roundProviderId,
      competition_id: persistedCompetition.id,
      season_id: seasonId,
      name: roundName,
      source_updated_at: timestamp,
      updated_at: timestamp,
    });
  }
  if (roundsByProviderIdInput.size) {
    const { error } = await admin.from("football_rounds").upsert(
      [...roundsByProviderIdInput.values()],
      { onConflict: "provider,provider_round_id" },
    );
    if (error) return { stored: false as const, reason: error.message, fixturesStored: 0 };
  }
  const { data: persistedRounds, error: roundsError } = requestedRoundProviderIds.size
    ? await admin
      .from("football_rounds")
      .select("id,provider_round_id")
      .eq("provider", competition.provider)
      .in("provider_round_id", [...requestedRoundProviderIds])
    : { data: [], error: null };
  if (roundsError) {
    return { stored: false as const, reason: roundsError.message, fixturesStored: 0 };
  }
  const roundsByProviderId = new Map((persistedRounds as DatabaseRecord[] ?? [])
    .map((round) => [asString(round.provider_round_id), asString(round.id)]));
  const rows = fixtures.flatMap((fixture) => {
    const homeClubId = clubsByProviderId.get(fixture.homeTeam?.providerId ?? "");
    const awayClubId = clubsByProviderId.get(fixture.awayTeam?.providerId ?? "");
    if (!homeClubId || !awayClubId || !fixture.startsAt) return [];
    return [{
      provider: fixture.provider,
      provider_fixture_id: fixture.providerId,
      competition_id: persistedCompetition.id,
      season_id: fixture.seasonId ? seasonsByProviderId.get(fixture.seasonId) ?? null : null,
      round_id: fixture.roundId ? roundsByProviderId.get(fixture.roundId) ?? null : null,
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
  if (fixturesError) return { stored: false as const, reason: fixturesError.message, fixturesStored: 0 };

  // Fixture scores are provider facts. The derived TouchLine coach result is
  // reconciled only after the canonical fixture write succeeds; final rows are
  // protected as immutable by the database command.
  const { data: coachReconciliation, error: coachReconciliationError } = await admin
    .rpc("touchline_reconcile_coach_fixture_points", {
      p_fixture_id: null,
      p_competition_coaches: touchlineCompetitionCoachAssignments(),
    });
  if (coachReconciliationError) {
    return {
      stored: false as const,
      reason: `coach-points-reconciliation-failed:${coachReconciliationError.code ?? "unknown"}`,
      fixturesStored: rows.length,
    };
  }
  return {
    stored: true as const,
    fixturesStored: rows.length,
    coachPointsReconciled: Number((coachReconciliation as { reconciled?: unknown } | null)?.reconciled ?? 0),
  };
}
