import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { TOUCHLINE_ENGLAND_CLUBS } from "@/lib/touchlineArena/demo-data";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  resolveTouchlineOfficialLeagueTable,
  TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
  TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
  type TouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableFixture,
  type TouchlineOfficialLeagueTableSeason,
  type TouchlineOfficialLeagueTableTeam,
} from "./official-league-table.ts";

const PROVIDER = "sportmonks" as const;
const MAX_SEASON_FIXTURES = 400;

type DatabaseRow = Record<string, unknown>;
type AdminClient = SupabaseClient;

export type TouchlineOfficialLeagueTableRequest = Readonly<{
  /** Test-only dependency injection; it bypasses the Next cache. */
  providedAdmin?: ReturnType<typeof createAdminClient>;
  /** Include the bounded public baseline only for live-enabled table consumers. */
  includeLiveProjectionSource?: boolean;
}>;

type ScopeResult =
  | Readonly<{ status: "ready"; competitionId: string; season: TouchlineOfficialLeagueTableSeason }>
  | Readonly<{ status: "unavailable"; reason: string }>
  | Readonly<{ status: "integrity_error"; reason: string }>;

function asRecord(value: unknown): DatabaseRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DatabaseRow : null;
}

function asRows(value: unknown): DatabaseRow[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((row): row is DatabaseRow => Boolean(row))
    : [];
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asScore(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function asTimestamp(value: unknown) {
  const timestamp = asTrimmedString(value);
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

function tableCacheTag(seasonId: string) {
  return `touchline-official-league-table:${TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID}:${seasonId}`;
}

function unavailableTable(reason: string): TouchlineOfficialLeagueTable {
  const table = resolveTouchlineOfficialLeagueTable({
    competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: null,
    teams: [],
    fixtures: [],
    sourceState: "unavailable",
  });
  return { ...table, reason };
}

async function resolveCurrentScope(admin: AdminClient): Promise<ScopeResult> {
  const competitionResult = await admin
    .from("football_competitions")
    .select("id")
    .eq("provider", PROVIDER)
    .eq("provider_competition_id", TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID)
    .maybeSingle();
  if (competitionResult.error) return { status: "unavailable", reason: "competition-query-failed" };
  const competition = asRecord(competitionResult.data);
  const competitionId = asTrimmedString(competition?.id);
  if (!competitionId) return { status: "integrity_error", reason: "competition-unresolved" };

  const seasonsResult = await admin
    .from("football_seasons")
    .select("id,provider_season_id,name,source_updated_at")
    .eq("competition_id", competitionId)
    .eq("is_current", true);
  if (seasonsResult.error) return { status: "unavailable", reason: "season-query-failed" };
  const currentSeasons = asRows(seasonsResult.data).flatMap((row) => {
    const id = asTrimmedString(row.id);
    const providerSeasonId = asTrimmedString(row.provider_season_id);
    const name = asTrimmedString(row.name);
    return id && providerSeasonId && name
      ? [{ id, providerSeasonId, name, sourceUpdatedAt: asTimestamp(row.source_updated_at) }]
      : [];
  });
  if (currentSeasons.length !== 1) {
    return { status: "integrity_error", reason: "current-season-unresolved" };
  }
  return { status: "ready", competitionId, season: currentSeasons[0] };
}

/** Public display context only: reuse the canonical season scope, without loading standings. */
export async function readTouchlineCurrentSeasonName(
  request: TouchlineOfficialLeagueTableRequest = {},
): Promise<string | null> {
  const admin = "providedAdmin" in request ? request.providedAdmin : createAdminClient();
  if (!admin) return null;
  try {
    const scope = await resolveCurrentScope(admin);
    return scope.status === "ready" ? scope.season.name : null;
  } catch {
    // An unavailable label must not take the persisted match schedule offline.
    return null;
  }
}

function toTableTeam(row: DatabaseRow): TouchlineOfficialLeagueTableTeam | null {
  const clubId = asTrimmedString(row.id);
  const providerTeamId = asTrimmedString(row.provider_team_id);
  const name = asTrimmedString(row.name);
  if (!clubId || !providerTeamId || !name) return null;
  const presentation = TOUCHLINE_ENGLAND_CLUBS.find((club) => club.teamId === providerTeamId);
  return {
    clubId,
    providerTeamId,
    name,
    // A public club route must come from the trusted England presentation
    // registry; an unknown canonical club fails closed in the pure resolver.
    slug: presentation?.slug ?? null,
    shortCode: presentation?.shortCode ?? asTrimmedString(row.short_code),
    logoUrl: presentation?.logoUrl ?? asTrimmedString(row.logo_url),
    sourceUpdatedAt: asTimestamp(row.source_updated_at),
  };
}

function toTableFixture(row: DatabaseRow): TouchlineOfficialLeagueTableFixture | null {
  const providerFixtureId = asTrimmedString(row.provider_fixture_id);
  if (!providerFixtureId) return null;
  return {
    provider: PROVIDER,
    providerFixtureId,
    seasonId: asTrimmedString(row.season_id),
    status: asTrimmedString(row.status),
    homeClubId: asTrimmedString(row.home_club_id),
    awayClubId: asTrimmedString(row.away_club_id),
    homeScore: asScore(row.home_score),
    awayScore: asScore(row.away_score),
    startsAt: asTimestamp(row.starts_at),
    sourceUpdatedAt: asTimestamp(row.source_updated_at),
  };
}

async function readOfficialLeagueTableForSeason(
  admin: AdminClient,
  expectedSeasonId: string,
): Promise<TouchlineOfficialLeagueTable> {
  const scope = await resolveCurrentScope(admin);
  if (scope.status === "unavailable") return unavailableTable(scope.reason);
  if (scope.status === "integrity_error") {
    return resolveTouchlineOfficialLeagueTable({
      competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
      season: null,
      teams: [],
      fixtures: [],
    });
  }
  if (scope.season.id !== expectedSeasonId) {
    return resolveTouchlineOfficialLeagueTable({
      competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
      season: scope.season,
      teams: [],
      fixtures: [],
    });
  }

  const [clubsResult, fixturesResult] = await Promise.all([
    admin
      .from("football_clubs")
      .select("id,provider_team_id,name,short_code,logo_url,source_updated_at")
      .eq("provider", PROVIDER)
      .eq("competition_id", scope.competitionId)
      .order("name", { ascending: true }),
    admin
      .from("football_fixtures")
      .select("provider_fixture_id,season_id,status,home_club_id,away_club_id,home_score,away_score,starts_at,source_updated_at")
      .eq("provider", PROVIDER)
      .eq("competition_id", scope.competitionId)
      .eq("season_id", scope.season.id)
      .order("starts_at", { ascending: true })
      .limit(MAX_SEASON_FIXTURES + 1),
  ]);
  if (clubsResult.error || fixturesResult.error) return unavailableTable("league-table-query-failed");

  const fixtureRows = asRows(fixturesResult.data);
  const teams = asRows(clubsResult.data)
    .map(toTableTeam)
    .filter((team): team is TouchlineOfficialLeagueTableTeam => Boolean(team));
  if (fixtureRows.length > MAX_SEASON_FIXTURES) {
    return resolveTouchlineOfficialLeagueTable({
      competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
      season: scope.season,
      teams,
      fixtures: [],
    });
  }
  const fixtures = fixtureRows
    .map(toTableFixture)
    .filter((fixture): fixture is TouchlineOfficialLeagueTableFixture => Boolean(fixture));
  const table = resolveTouchlineOfficialLeagueTable({
    competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: scope.season,
    teams,
    fixtures,
    expectedClubCount: TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
  });
  // The public live baseline must be complete, even where the existing table
  // resolver can still render a neutral/pending view after discarding a row.
  // Reuse only these explicit public projections; never serialize DB rows.
  const hasCompleteLiveSource = (table.state === "ready" || table.state === "pending_no_final")
    && teams.length === TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT
    && Array.isArray(clubsResult.data)
    && teams.length === clubsResult.data.length
    && Array.isArray(fixturesResult.data)
    && fixtures.length === fixturesResult.data.length
    && fixtures.length <= MAX_SEASON_FIXTURES
    && fixtures.every((fixture) => fixture.seasonId === scope.season.id)
    && new Set(fixtures.map((fixture) => fixture.providerFixtureId)).size === fixtures.length;
  if (!hasCompleteLiveSource) return table;
  return {
    ...table,
    liveProjectionSource: {
      competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
      season: scope.season,
      teams,
      fixtures,
    },
  };
}

function tableForRequest(
  table: TouchlineOfficialLeagueTable,
  request: TouchlineOfficialLeagueTableRequest,
): TouchlineOfficialLeagueTable {
  if (request.includeLiveProjectionSource === true || !("liveProjectionSource" in table)) return table;
  // Keep the cached baseline intact for opted-in consumers sharing this key.
  const publicTable = { ...table };
  delete publicTable.liveProjectionSource;
  return publicTable;
}

/**
 * Canonical public standings read. It loads one current season and at most one
 * league-sized fixture set; no client fetch, player card, market or wallet
 * data participates in this projection.
 */
export async function loadTouchlineOfficialLeagueTable(
  request: TouchlineOfficialLeagueTableRequest = {},
): Promise<TouchlineOfficialLeagueTable> {
  const admin = request.providedAdmin ?? createAdminClient();
  if (!admin) return unavailableTable("supabase-admin-unavailable");

  const scope = await resolveCurrentScope(admin);
  if (scope.status === "unavailable") return unavailableTable(scope.reason);
  if (scope.status === "integrity_error") {
    return resolveTouchlineOfficialLeagueTable({
      competitionProviderId: TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
      season: null,
      teams: [],
      fixtures: [],
    });
  }
  if (request.providedAdmin) {
    return tableForRequest(await readOfficialLeagueTableForSeason(admin, scope.season.id), request);
  }

  const cached = unstable_cache(
    async () => {
      const cacheAdmin = createAdminClient();
      return cacheAdmin
        ? readOfficialLeagueTableForSeason(cacheAdmin, scope.season.id)
        : unavailableTable("supabase-admin-unavailable");
    },
    // Version the cached DTO whenever displayed-table semantics change. This
    // prevents a new deployment from serving one stale prior-shape response
    // while stale-while-revalidate refreshes the shared Data Cache.
    ["touchline-official-league-table-v5", TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID, scope.season.id],
    // The single table includes persisted live score facts provisionally.
    // Ten seconds bounds normal browser polling without requiring a manual
    // reload; a degraded provider leaves the last persisted fixture state.
    { revalidate: 10, tags: [tableCacheTag(scope.season.id)] },
  );
  return tableForRequest(await cached(), request);
}

/** Call only after an approved canonical fixture/result import succeeds. */
export function revalidateTouchlineOfficialLeagueTable(seasonId: string | null | undefined) {
  const normalizedSeasonId = asTrimmedString(seasonId);
  if (!normalizedSeasonId) return;
  revalidateTag(tableCacheTag(normalizedSeasonId), "max");
}
