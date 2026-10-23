import {
  resolveTouchlineOfficialLeagueTable,
  TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT,
  TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID,
  type TouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableLiveSource,
} from "../football-data/official-league-table.ts";
import { isTouchlinePublicFixture } from "../football-data/public-fixture-client.ts";
import type { TouchlinePresentationRead, createTouchlineLivePresentationStore } from "./live-presentation-client-store";
import { createTouchlineSportsPublicationReader } from "./sports-publication-reader.ts";

export type TouchlineOfficialTablePublicationScope = Readonly<{
  competitionProviderId: string;
  seasonId: string;
  providerSeasonId: string;
}>;

type PublishedFixtureFact = Readonly<{
  providerFixtureId: string;
  homeProviderId: string;
  awayProviderId: string;
  status: string | null;
  homeScore: number | null;
  awayScore: number | null;
  verifiedAt: string | null;
  degraded: boolean;
}>;

export type TouchlineOfficialTablePublishedFacts = Readonly<{
  scopeKey: string;
  fixtures: readonly PublishedFixtureFact[];
  receivedAt: number;
}>;

export function touchlineOfficialTableScopeKey(scope: TouchlineOfficialTablePublicationScope) {
  return JSON.stringify([scope.competitionProviderId, scope.seasonId, scope.providerSeasonId]);
}

function fixtureKey(id: string, home: string, away: string) {
  return JSON.stringify([id, home, away]);
}

/** Only canonical fixture + ordered club identities may occupy retained state. */
export function touchlineOfficialTableAdmittedFixtureKeys(source?: TouchlineOfficialLeagueTableLiveSource): ReadonlySet<string> {
  if (!source || source.fixtures.length > 400 || source.teams.length !== TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT
    || source.competitionProviderId !== TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID) return new Set();
  const teams = new Map(source.teams.map(team => [team.clubId, team.providerTeamId]));
  return new Set(source.fixtures.flatMap(fixture => {
    const home = teams.get(fixture.homeClubId ?? ""), away = teams.get(fixture.awayClubId ?? "");
    return fixture.provider === "sportmonks" && fixture.seasonId === source.season.id && home && away && home !== away
      ? [fixtureKey(fixture.providerFixtureId, home, away)] : [];
  }));
}

/** Omission is not withdrawal. Only an explicitly admitted fixture replaces its own facts. */
export function mergeTouchlineOfficialTablePublishedFacts(
  previous: TouchlineOfficialTablePublishedFacts | null,
  read: TouchlinePresentationRead,
  scope: TouchlineOfficialTablePublicationScope,
  admitted: ReadonlySet<string>,
): TouchlineOfficialTablePublishedFacts | null {
  const publication = read.sportsPublication;
  if (!publication || scope.competitionProviderId !== TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID) return previous;
  const scopeKey = touchlineOfficialTableScopeKey(scope);
  const scoped = publication.live.fixtures.filter(fixture => fixture.competitionId === scope.competitionProviderId
    && fixture.seasonId === scope.providerSeasonId);
  if (scoped.some(fixture => !isTouchlinePublicFixture(fixture))
    || new Set(scoped.map(fixture => fixture.providerId)).size !== scoped.length) return previous;
  const facts = new Map((previous?.scopeKey === scopeKey ? previous.fixtures : []).filter(fact => admitted.has(
    fixtureKey(fact.providerFixtureId, fact.homeProviderId, fact.awayProviderId))).map(fact => [
    fixtureKey(fact.providerFixtureId, fact.homeProviderId, fact.awayProviderId), fact,
  ]));
  for (const fixture of scoped) {
    const key = fixtureKey(fixture.providerId, fixture.homeTeam!.providerId, fixture.awayTeam!.providerId);
    if (!admitted.has(key)) continue;
    // Bound retained state even for a malformed caller-provided admission set.
    if (!facts.has(key) && facts.size >= 400) continue;
    facts.set(key, {
      providerFixtureId: fixture.providerId,
      homeProviderId: fixture.homeTeam!.providerId,
      awayProviderId: fixture.awayTeam!.providerId,
      status: fixture.status ?? null,
      homeScore: fixture.homeScore ?? null,
      awayScore: fixture.awayScore ?? null,
      verifiedAt: fixture.verifiedAt ?? null,
      degraded: read.state.liveFreshness?.degraded !== false,
    });
  }
  return { scopeKey, fixtures: [...facts.values()], receivedAt: read.receivedAt };
}

/**
 * Historical SSR baseline + accepted immutable scores, NOT an atomic historical
 * table snapshot. Reuses the official resolver; no second points/rank engine.
 */
export function projectTouchlinePublishedOfficialTable(
  baseline: TouchlineOfficialLeagueTable,
  published: TouchlineOfficialTablePublishedFacts | null,
): TouchlineOfficialLeagueTable {
  const source = baseline.liveProjectionSource;
  if (!source || !published || !baseline.season
    || (baseline.state !== "ready" && baseline.state !== "pending_no_final")
    || source.competitionProviderId !== TOUCHLINE_ENGLAND_OFFICIAL_COMPETITION_PROVIDER_ID
    || baseline.competitionProviderId !== source.competitionProviderId
    || baseline.season.id !== source.season.id || baseline.season.providerSeasonId !== source.season.providerSeasonId
    || published.scopeKey !== touchlineOfficialTableScopeKey({ competitionProviderId: source.competitionProviderId,
      seasonId: source.season.id, providerSeasonId: source.season.providerSeasonId })
    || source.teams.length !== TOUCHLINE_ENGLAND_EXPECTED_CLUB_COUNT || source.fixtures.length > 400
    || source.fixtures.some(fixture => fixture.provider !== "sportmonks" || fixture.seasonId !== source.season.id)
    || new Set(source.fixtures.map(fixture => fixture.providerFixtureId)).size !== source.fixtures.length) return baseline;
  const checked = resolveTouchlineOfficialLeagueTable({ ...source, now: published.receivedAt });
  if (checked.state !== "ready" && checked.state !== "pending_no_final") return baseline;
  const teams = new Map(source.teams.map(team => [team.clubId, team.providerTeamId]));
  const facts = new Map(published.fixtures.map(fact => [
    fixtureKey(fact.providerFixtureId, fact.homeProviderId, fact.awayProviderId), fact,
  ]));
  const applied = new Map<string, PublishedFixtureFact>();
  const fixtures = source.fixtures.map(fixture => {
    const home = teams.get(fixture.homeClubId ?? "");
    const away = teams.get(fixture.awayClubId ?? "");
    const fact = home && away ? facts.get(fixtureKey(fixture.providerFixtureId, home, away)) : null;
    if (!fact) return fixture;
    applied.set(fixture.providerFixtureId, fact);
    return { ...fixture, status: fact.status, homeScore: fact.homeScore, awayScore: fact.awayScore,
      sourceUpdatedAt: fact.verifiedAt };
  });
  if (!applied.size) return baseline;
  const table = resolveTouchlineOfficialLeagueTable({ ...source, fixtures, now: published.receivedAt });
  return { ...table, liveProjectionSource: source, rows: table.rows.map(row => {
    const fact = row.liveFixture ? applied.get(row.liveFixture.providerFixtureId) : null;
    if (!row.liveFixture || !fact) return row;
    const verifiedAt = fact.verifiedAt ? Date.parse(fact.verifiedAt) : Number.NaN;
    return { ...row, liveFixture: { ...row.liveFixture, stale: row.liveFixture.stale || fact.degraded
      || !Number.isFinite(verifiedAt) || verifiedAt > published.receivedAt } };
  }) };
}

/** Stable per canonical season, not per SSR response/digest: late SSR cannot undo accepted facts. */
export function createTouchlineOfficialTablePublicationReader(
  store: ReturnType<typeof createTouchlineLivePresentationStore>,
  scope: TouchlineOfficialTablePublicationScope,
) {
  const reader = createTouchlineSportsPublicationReader(store);
  let current: TouchlineOfficialTablePublishedFacts | null = null;
  let lastEpoch = -1;
  return {
    getSnapshot: () => current,
    subscribe(notify: () => void, admitted: ReadonlySet<string>) {
      return reader.subscribe(() => {
        const read = reader.getSnapshot();
        if (!read || read.requestEpoch <= lastEpoch) return;
        lastEpoch = read.requestEpoch;
        // Epoch orders reads, never scores/digests/timestamps: A -> B -> A is valid.
        current = mergeTouchlineOfficialTablePublishedFacts(current, read, scope, admitted);
        notify();
      });
    },
  };
}
