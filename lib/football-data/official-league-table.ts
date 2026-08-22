import { buildOfficialStandings, type OfficialStandingsRow } from "./official-standings.ts";
import type { TouchlineFixture } from "./types.ts";

export const TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID = "8";
export const TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT = 20;

export type TouchlineOfficialLeagueTableState =
  | "ready"
  | "pending_no_final"
  | "partial"
  | "unavailable"
  | "integrity_error";

export type TouchlineOfficialLeagueTableSeason = Readonly<{
  id: string;
  providerSeasonId: string;
  name: string;
  sourceUpdatedAt: string | null;
}>;

export type TouchlineOfficialLeagueTableTeam = Readonly<{
  clubId: string;
  providerTeamId: string;
  name: string;
  shortCode: string | null;
  slug: string | null;
  logoUrl: string | null;
  sourceUpdatedAt: string | null;
}>;

export type TouchlineOfficialLeagueTableFixture = Readonly<{
  provider: "sportmonks";
  providerFixtureId: string;
  seasonId: string | null;
  status: string | null;
  homeClubId: string | null;
  awayClubId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  startsAt: string | null;
  sourceUpdatedAt: string | null;
}>;

export type TouchlineOfficialLeagueTableCoverage = Readonly<{
  expectedClubs: number;
  mappedClubs: number;
  fixturesInSeason: number;
  completedFixtures: number;
  duplicateFixtures: number;
}>;

export type TouchlineOfficialLeagueTableRow = Readonly<{
  position: number | null;
  team: Readonly<{
    providerTeamId: string;
    name: string;
    shortCode: string | null;
    slug: string;
    logoUrl: string | null;
  }>;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: readonly ("W" | "D" | "L")[];
  /** A persisted in-progress fixture. It informs the row but never alters standings totals before final. */
  liveFixture: Readonly<{
    providerFixtureId: string;
    scoreFor: number | null;
    scoreAgainst: number | null;
  }> | null;
}>;

export type TouchlineOfficialLeagueTable = Readonly<{
  state: TouchlineOfficialLeagueTableState;
  competitionProviderId: string;
  season: TouchlineOfficialLeagueTableSeason | null;
  asOf: string | null;
  coverage: TouchlineOfficialLeagueTableCoverage;
  rows: readonly TouchlineOfficialLeagueTableRow[];
  reason: string | null;
}>;

type ResolveInput = Readonly<{
  competitionProviderId?: string;
  season: TouchlineOfficialLeagueTableSeason | null;
  teams: readonly TouchlineOfficialLeagueTableTeam[];
  fixtures: readonly TouchlineOfficialLeagueTableFixture[];
  sourceState?: "ready" | "unavailable";
  expectedClubCount?: number;
}>;

function maxTimestamp(values: readonly (string | null | undefined)[]) {
  const timestamps = values
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .map((value) => Date.parse(value));
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function emptyTable(
  input: ResolveInput,
  state: TouchlineOfficialLeagueTableState,
  reason: string | null,
  coverage?: Partial<TouchlineOfficialLeagueTableCoverage>,
): TouchlineOfficialLeagueTable {
  const expectedClubs = input.expectedClubCount ?? TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT;
  return {
    state,
    competitionProviderId: input.competitionProviderId ?? TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: input.season,
    asOf: maxTimestamp([
      input.season?.sourceUpdatedAt,
      ...input.teams.map((team) => team.sourceUpdatedAt),
      ...input.fixtures.map((fixture) => fixture.sourceUpdatedAt),
    ]),
    coverage: {
      expectedClubs,
      mappedClubs: input.teams.length,
      fixturesInSeason: 0,
      completedFixtures: 0,
      duplicateFixtures: 0,
      ...coverage,
    },
    rows: [],
    reason,
  };
}

function fixtureForStandings(
  fixture: TouchlineOfficialLeagueTableFixture,
  teamsByClubId: ReadonlyMap<string, TouchlineOfficialLeagueTableTeam>,
): TouchlineFixture | null {
  const homeTeam = fixture.homeClubId ? teamsByClubId.get(fixture.homeClubId) : null;
  const awayTeam = fixture.awayClubId ? teamsByClubId.get(fixture.awayClubId) : null;
  if (!homeTeam || !awayTeam || homeTeam.clubId === awayTeam.clubId) return null;
  return {
    id: `${fixture.provider}:${fixture.providerFixtureId}`,
    provider: fixture.provider,
    providerId: fixture.providerFixtureId,
    status: fixture.status ?? undefined,
    startsAt: fixture.startsAt ?? undefined,
    homeScore: fixture.homeScore ?? undefined,
    awayScore: fixture.awayScore ?? undefined,
    homeTeam: {
      id: `${fixture.provider}:${homeTeam.providerTeamId}`,
      provider: fixture.provider,
      providerId: homeTeam.providerTeamId,
      name: homeTeam.name,
      source: { provider: fixture.provider, providerId: homeTeam.providerTeamId },
    },
    awayTeam: {
      id: `${fixture.provider}:${awayTeam.providerTeamId}`,
      provider: fixture.provider,
      providerId: awayTeam.providerTeamId,
      name: awayTeam.name,
      source: { provider: fixture.provider, providerId: awayTeam.providerTeamId },
    },
    source: { provider: fixture.provider, providerId: fixture.providerFixtureId, lastSyncedAt: fixture.sourceUpdatedAt ?? undefined },
  };
}

function isLiveFixture(fixture: TouchlineOfficialLeagueTableFixture) {
  const status = fixture.status?.trim().toLowerCase().replace(/[_-]+/g, " ") ?? "";
  return /^(?:live|in play|inplay|1st half|2nd half|half time|ht|extra time|penalties)$/.test(status);
}

function liveFixtureForClub(
  clubId: string,
  fixtures: readonly TouchlineOfficialLeagueTableFixture[],
) {
  const liveFixtures = fixtures.filter((fixture) => isLiveFixture(fixture)
    && (fixture.homeClubId === clubId || fixture.awayClubId === clubId));
  // A club cannot safely be assigned a score when the persisted source claims
  // more than one concurrent fixture. Leave the row neutral until that source
  // inconsistency resolves.
  if (liveFixtures.length !== 1) return null;
  const fixture = liveFixtures[0];
  const home = fixture.homeClubId === clubId;
  return {
    providerFixtureId: fixture.providerFixtureId,
    scoreFor: home ? fixture.homeScore : fixture.awayScore,
    scoreAgainst: home ? fixture.awayScore : fixture.homeScore,
  };
}

function tableRows(
  standingsRows: readonly OfficialStandingsRow<TouchlineOfficialLeagueTableTeam>[],
  positionsVerified: boolean,
  fixtures: readonly TouchlineOfficialLeagueTableFixture[],
): readonly TouchlineOfficialLeagueTableRow[] {
  return standingsRows.flatMap((row, index) => {
    const team = row.team;
    if (!team.slug) return [];
    return [{
      position: positionsVerified ? index + 1 : null,
      team: {
        providerTeamId: team.providerTeamId,
        name: team.name,
        shortCode: team.shortCode,
        slug: team.slug,
        logoUrl: team.logoUrl,
      },
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
      form: row.form,
      liveFixture: liveFixtureForClub(team.clubId, fixtures),
    }];
  });
}

/**
 * Before the first verified final, the canonical 20-club scope is useful but
 * no sporting position exists. Keep the server-provided club order intact and
 * publish neutral zero statistics with null positions rather than inventing a
 * table or hiding the season entirely.
 */
function preSeasonRows(
  teams: readonly TouchlineOfficialLeagueTableTeam[],
  fixtures: readonly TouchlineOfficialLeagueTableFixture[],
): readonly TouchlineOfficialLeagueTableRow[] {
  return teams.flatMap((team) => team.slug ? [{
    position: null,
    team: {
      providerTeamId: team.providerTeamId,
      name: team.name,
      shortCode: team.shortCode,
      slug: team.slug,
      logoUrl: team.logoUrl,
    },
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    form: [],
    liveFixture: liveFixtureForClub(team.clubId, fixtures),
  }] : []);
}

/**
 * Pure public-table resolver. It never fetches a provider or database, so the
 * caller must supply one canonical competition and one canonical season.
 * A query failure is deliberately distinct from a pre-season with no finals.
 */
export function resolveTouchlineOfficialLeagueTable(input: ResolveInput): TouchlineOfficialLeagueTable {
  const expectedClubs = input.expectedClubCount ?? TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT;
  if (input.sourceState === "unavailable") return emptyTable(input, "unavailable", "source-unavailable");
  if (!input.season?.id || !input.season.providerSeasonId || !input.season.name) {
    return emptyTable(input, "integrity_error", "current-season-unresolved");
  }

  const teamIds = new Set<string>();
  const providerTeamIds = new Set<string>();
  const malformedTeam = input.teams.some((team) => {
    if (!team.clubId || !team.providerTeamId || !team.name || !team.slug) return true;
    if (teamIds.has(team.clubId) || providerTeamIds.has(team.providerTeamId)) return true;
    teamIds.add(team.clubId);
    providerTeamIds.add(team.providerTeamId);
    return false;
  });
  if (malformedTeam || input.teams.length !== expectedClubs) {
    return emptyTable(input, "integrity_error", "club-identity-mismatch", { mappedClubs: input.teams.length });
  }

  const teamsByClubId = new Map(input.teams.map((team) => [team.clubId, team] as const));
  const fixturesInSeason = input.fixtures.filter((fixture) => fixture.seasonId === input.season?.id);
  const malformedFixture = fixturesInSeason.some((fixture) => {
    if (!fixture.providerFixtureId || !fixture.homeClubId || !fixture.awayClubId) return true;
    return !teamsByClubId.has(fixture.homeClubId)
      || !teamsByClubId.has(fixture.awayClubId)
      || fixture.homeClubId === fixture.awayClubId;
  });
  if (malformedFixture) {
    return emptyTable(input, "integrity_error", "fixture-club-mismatch", { fixturesInSeason: fixturesInSeason.length });
  }

  const standingsFixtures = fixturesInSeason
    .map((fixture) => fixtureForStandings(fixture, teamsByClubId))
    .filter((fixture): fixture is TouchlineFixture => Boolean(fixture));
  const standings = buildOfficialStandings({
    teams: input.teams.map((team) => ({ providerTeamId: team.providerTeamId, name: team.name, value: team })),
    fixtures: standingsFixtures,
  });
  const coverage: TouchlineOfficialLeagueTableCoverage = {
    expectedClubs,
    mappedClubs: input.teams.length,
    fixturesInSeason: fixturesInSeason.length,
    completedFixtures: standings.completedFixtures,
    duplicateFixtures: standings.duplicateFixtures,
  };
  const asOf = maxTimestamp([
    input.season.sourceUpdatedAt,
    ...input.teams.map((team) => team.sourceUpdatedAt),
    ...fixturesInSeason.map((fixture) => fixture.sourceUpdatedAt),
  ]);
  if (!standings.completedFixtures) {
    return {
      ...emptyTable(input, "pending_no_final", "no-verified-final", coverage),
      asOf,
      rows: preSeasonRows(input.teams, fixturesInSeason),
    };
  }

  const hasProvisionalOrdering = standings.hasUnresolvedTieBreaks || standings.duplicateFixtures > 0;
  const state: TouchlineOfficialLeagueTableState = hasProvisionalOrdering ? "partial" : "ready";
  return {
    state,
    competitionProviderId: input.competitionProviderId ?? TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
    season: input.season,
    asOf,
    coverage,
    rows: tableRows(standings.rows, !hasProvisionalOrdering, fixturesInSeason),
    reason: standings.hasUnresolvedTieBreaks
      ? "official-tiebreak-pending"
      : standings.duplicateFixtures > 0
      ? "duplicate-fixture-observed"
      : null,
  };
}
