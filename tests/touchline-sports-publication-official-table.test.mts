import assert from "node:assert/strict";
import test from "node:test";
import { resolveTouchlineOfficialLeagueTable, type TouchlineOfficialLeagueTable,
  type TouchlineOfficialLeagueTableLiveSource } from "../lib/football-data/official-league-table.ts";
import { createTouchlineOfficialTablePublicationReader, mergeTouchlineOfficialTablePublishedFacts as mergeFacts,
  touchlineOfficialTableAdmittedFixtureKeys,
  projectTouchlinePublishedOfficialTable } from "../lib/touchlineArena/sports-publication-official-table.ts";
import type { TouchlinePresentationRead, createTouchlineLivePresentationStore } from "../lib/touchlineArena/live-presentation-client-store.ts";

const NOW = Date.parse("2026-10-23T13:00:00Z");
const stamp = new Date(NOW).toISOString();
const scope = { competitionProviderId: "8", seasonId: "10000000-0000-4000-8000-000000000050", providerSeasonId: "28083" };
function source(): TouchlineOfficialLeagueTableLiveSource {
  return { competitionProviderId: "8", season: { id: scope.seasonId, providerSeasonId: "28083", name: "2026/27", sourceUpdatedAt: stamp },
    teams: Array.from({ length: 20 }, (_, i) => ({ clubId: `club-${i + 1}`, providerTeamId: String(i + 1), name: `Club ${i + 1}`,
      shortCode: null, slug: `club-${i + 1}`, logoUrl: null, sourceUpdatedAt: stamp })),
    fixtures: [{ provider: "sportmonks", providerFixtureId: "90", seasonId: scope.seasonId, status: "FT", homeClubId: "club-2",
      awayClubId: "club-3", homeScore: 1, awayScore: 0, startsAt: "2026-10-20T13:00:00Z", sourceUpdatedAt: stamp },
    { provider: "sportmonks", providerFixtureId: "100", seasonId: scope.seasonId, status: "LIVE", homeClubId: "club-1",
      awayClubId: "club-2", homeScore: 0, awayScore: 0, startsAt: stamp, sourceUpdatedAt: stamp }] };
}
function baseline(input = source()): TouchlineOfficialLeagueTable {
  return { ...resolveTouchlineOfficialLeagueTable({ ...input, now: NOW }), liveProjectionSource: input };
}
function read(epoch = 1, homeScore: number | undefined = 1, awayScore: number | undefined = 0): TouchlinePresentationRead {
  return { generation: epoch, requestEpoch: epoch, receivedAt: NOW,
    state: { version: 1, available: true, playerRankingSnapshotId: null, coachRankingSnapshotId: null,
      livePresentationSnapshotId: "a".repeat(32), mode: "live", pollAfterMs: 10_000, resumeAt: null,
      liveFreshness: { fetchedAt: stamp, ageMs: 0, degraded: false } },
    sportsPublication: { version: 1, scopeKey: "touchline-england", publication: { snapshotId: "10000000-0000-4000-8000-000000000001",
      contentDigest: "a".repeat(32), liveScoreSnapshotDigest: "b".repeat(32), publishedAt: stamp,
      playerRankingSnapshotId: null, coachRankingSnapshotId: null }, playerRanking: null, coachRanking: null,
      live: { fetchedAt: stamp, fixtures: [{ id: "100", providerId: "100", competitionId: "8", seasonId: "28083", status: "LIVE",
        homeTeam: { id: "1", providerId: "1", name: "Untrusted display name" }, awayTeam: { id: "2", providerId: "2", name: "Other name" },
        homeScore, awayScore, verifiedAt: stamp }] } } };
}
function patchFixture(changes: Record<string, unknown>, epoch = 1) {
  const value = read(epoch);
  return { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp,
    fixtures: [{ ...value.sportsPublication!.live.fixtures[0], ...changes }] } } } as TouchlinePresentationRead;
}
const row = (table: TouchlineOfficialLeagueTable, id = "1") => table.rows.find(row => row.team.providerTeamId === id)!;
function mergeTouchlineOfficialTablePublishedFacts(...args: Parameters<typeof mergeFacts> extends [...infer T, unknown] ? T : never) {
  return mergeFacts(...args, touchlineOfficialTableAdmittedFixtureKeys(source()));
}

test("shared goals, equaliser, downward correction and final reuse official rules without duplicate totals", () => {
  const seed = baseline(), frozen = JSON.stringify(seed);
  let facts = null;
  for (const [index, [home, away, points1, points2]] of [[1, 0, 3, 3], [1, 1, 1, 4], [0, 1, 0, 6], [2, 1, 3, 3]].entries()) {
    facts = mergeTouchlineOfficialTablePublishedFacts(facts, read(index + 1, home, away), scope);
    const result = projectTouchlinePublishedOfficialTable(seed, facts);
    assert.equal(row(result).points, points1); assert.equal(row(result, "2").points, points2);
    assert.equal(row(result).played, 1); assert.equal(row(result, "2").played, 2);
    assert.equal(row(result).goalsFor, home); assert.equal(result.coverage.fixturesInSeason, 2);
    assert.equal(row(result).team.name, "Club 1", "published labels cannot rewrite canonical identity");
    const expected = resolveTouchlineOfficialLeagueTable({ ...source(), fixtures: [source().fixtures[0],
      { ...source().fixtures[1], homeScore: home, awayScore: away }], now: NOW });
    assert.deepEqual(result.rows, expected.rows, "use exactly the approved standings/tie-break engine");
  }
  facts = mergeTouchlineOfficialTablePublishedFacts(facts, patchFixture({ status: "FT", homeScore: 2, awayScore: 1 }, 5), scope);
  const final = projectTouchlinePublishedOfficialTable(seed, facts);
  assert.equal(final.coverage.completedFixtures, 2); assert.equal(final.coverage.liveFixtures, 0);
  assert.equal(row(final).liveFixture, null); assert.equal(row(final).points, 3);
  assert.equal(JSON.stringify(seed), frozen, "projection cannot mutate SSR baseline/history");
});

test("explicit score absence, status withdrawal and zero differ from omission", () => {
  const seed = baseline(), accepted = mergeTouchlineOfficialTablePublishedFacts(null, read(), scope);
  for (const changes of [{ homeScore: undefined, awayScore: undefined }, { status: "Cancelled" }, { status: undefined }]) {
    const facts = mergeTouchlineOfficialTablePublishedFacts(accepted, patchFixture(changes, 2), scope);
    assert.equal(row(projectTouchlinePublishedOfficialTable(seed, facts)).points, 0);
  }
  const zero = mergeTouchlineOfficialTablePublishedFacts(accepted, read(2, 0, 0), scope);
  assert.equal(row(projectTouchlinePublishedOfficialTable(seed, zero)).points, 1);
  const omitted = { ...read(3), sportsPublication: { ...read(3).sportsPublication!, live: { fetchedAt: stamp, fixtures: [] } } };
  const retained = mergeTouchlineOfficialTablePublishedFacts(accepted, omitted, scope);
  assert.equal(row(projectTouchlinePublishedOfficialTable(seed, retained)).points, 3);
});

test("provider fixture, ordered teams, league and provider season are all required; no appended matches", () => {
  const seed = baseline();
  for (const changes of [{ providerId: "999", id: "999" }, { competitionId: "9" }, { seasonId: scope.seasonId },
    { seasonId: "28084" }, { competitionId: undefined }, { seasonId: undefined },
    { homeTeam: { id: "2", providerId: "2", name: "Club 1" }, awayTeam: { id: "1", providerId: "1", name: "Club 2" } }]) {
    const facts = mergeTouchlineOfficialTablePublishedFacts(null, patchFixture(changes), scope);
    assert.equal(projectTouchlinePublishedOfficialTable(seed, facts), seed);
  }
  const accepted = mergeTouchlineOfficialTablePublishedFacts(null, read(), scope);
  const wrongTeam = mergeTouchlineOfficialTablePublishedFacts(accepted, patchFixture({ homeTeam: { id: "3", providerId: "3", name: "Club 1" } }, 2), scope);
  assert.equal(row(projectTouchlinePublishedOfficialTable(seed, wrongTeam)).points, 3, "mismatch cannot erase the correctly admitted identity");
});

test("duplicate or unavailable source and partial DTO do not project even with apparently fresh facts", () => {
  const seed = baseline(), facts = mergeTouchlineOfficialTablePublishedFacts(null, read(), scope);
  for (const candidate of [{ ...seed, liveProjectionSource: undefined }, { ...seed, state: "unavailable" as const },
    { ...seed, state: "partial" as const }, { ...seed, competitionProviderId: "9" },
    { ...seed, liveProjectionSource: { ...source(), fixtures: [...source().fixtures, source().fixtures[1]] } },
    { ...seed, liveProjectionSource: { ...source(), teams: source().teams.slice(1) } },
    { ...seed, liveProjectionSource: { ...source(), fixtures: [{ ...source().fixtures[1], seasonId: "other" }] } }]) {
    assert.equal(projectTouchlinePublishedOfficialTable(candidate, facts), candidate);
  }
  const duplicated = { ...read(2), sportsPublication: { ...read(2).sportsPublication!, live: { fetchedAt: stamp,
    fixtures: [...read(2).sportsPublication!.live.fixtures, ...read(2).sportsPublication!.live.fixtures] } } };
  assert.equal(mergeTouchlineOfficialTablePublishedFacts(facts, duplicated, scope), facts);
});

test("400 out-of-baseline identities cannot exhaust capacity before the canonical fixture arrives", () => {
  const value = read();
  const extras = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp,
    fixtures: Array.from({ length: 400 }, (_, index) => ({ ...value.sportsPublication!.live.fixtures[0],
      id: String(1_000 + index), providerId: String(1_000 + index) })) } } };
  const rejected = mergeTouchlineOfficialTablePublishedFacts(null, extras, scope);
  assert.equal(rejected?.fixtures.length, 0);
  const accepted = mergeTouchlineOfficialTablePublishedFacts(rejected, read(2, 2, 0), scope);
  assert.equal(accepted?.fixtures.length, 1);
  assert.equal(row(projectTouchlinePublishedOfficialTable(baseline(), accepted)).goalsFor, 2);
});

test("degradation belongs to accepted facts and omission cannot renew their freshness", () => {
  const seed = baseline();
  for (const value of [patchFixture({ verifiedAt: undefined }), patchFixture({ verifiedAt: "2026-10-24T13:00:00Z" }),
    { ...read(), state: { ...read().state, liveFreshness: { fetchedAt: stamp, ageMs: 1, degraded: true } } }]) {
    const accepted = mergeTouchlineOfficialTablePublishedFacts(null, value, scope);
    const omit = { ...read(2), receivedAt: NOW + 10_000, sportsPublication: { ...read(2).sportsPublication!, live: { fetchedAt: stamp, fixtures: [] } } };
    const result = projectTouchlinePublishedOfficialTable(seed, mergeTouchlineOfficialTablePublishedFacts(accepted, omit, scope));
    assert.equal(row(result).liveFixture?.stale, true); assert.equal(row(result).points, 3);
  }
  const accepted = mergeTouchlineOfficialTablePublishedFacts(null, read(), scope);
  const aged = { ...read(2), receivedAt: NOW + 181_000, sportsPublication: { ...read(2).sportsPublication!, live: { fetchedAt: stamp, fixtures: [] } } };
  assert.equal(row(projectTouchlinePublishedOfficialTable(seed, mergeTouchlineOfficialTablePublishedFacts(accepted, aged, scope))).liveFixture?.stale, true);
});

test("mounted reader preserves corrections over late SSR and admits A→B→A by epoch, not score or digest", () => {
  const listeners = new Set<(value: TouchlinePresentationRead) => void>();
  let revalidations = 0, notified = 0;
  const store = { getRequestEpoch: () => 3, revalidate: () => { revalidations++; },
    subscribe(fn: (value: TouchlinePresentationRead) => void, sports: boolean) {
      assert.equal(sports, true); listeners.add(fn); return () => listeners.delete(fn);
    } } as unknown as ReturnType<typeof createTouchlineLivePresentationStore>;
  const adapter = createTouchlineOfficialTablePublicationReader(store, scope);
  let stop = adapter.subscribe(() => { notified++; }, touchlineOfficialTableAdmittedFixtureKeys(source()));
  const emit = (value: TouchlinePresentationRead) => listeners.forEach(fn => fn(value));
  assert.equal(adapter.getSnapshot(), null);
  emit(read(3)); assert.equal(revalidations, 1); assert.equal(adapter.getSnapshot(), null);
  for (const [epoch, home] of [[4, 1], [5, 2], [6, 1]]) {
    emit(read(epoch, home)); assert.equal(row(projectTouchlinePublishedOfficialTable(baseline(), adapter.getSnapshot())).goalsFor, home);
  }
  const lateSSR = source();
  const late = baseline({ ...lateSSR, fixtures: [lateSSR.fixtures[0], { ...lateSSR.fixtures[1], homeScore: 9 }] });
  assert.equal(row(projectTouchlinePublishedOfficialTable(late, adapter.getSnapshot())).goalsFor, 1);
  emit(read(5, 8)); assert.equal(notified, 3, "older epochs cannot replace the accepted correction");
  const mismatched = { ...read(7), state: { ...read(7).state, livePresentationSnapshotId: "c".repeat(32) } };
  emit(mismatched); assert.equal(notified, 3);
  const other = createTouchlineOfficialTablePublicationReader(store, { ...scope, seasonId: "other", providerSeasonId: "28084" });
  assert.equal(other.getSnapshot(), null, "other season cannot inherit LKG");
  const original = baseline();
  assert.equal(projectTouchlinePublishedOfficialTable(original, { ...adapter.getSnapshot()!, scopeKey: "other" }), original);
  stop();
  const updatedSource = { ...source(), fixtures: [...source().fixtures, { ...source().fixtures[1], providerFixtureId: "101" }] };
  stop = adapter.subscribe(() => { notified++; }, touchlineOfficialTableAdmittedFixtureKeys(updatedSource));
  assert.equal(row(projectTouchlinePublishedOfficialTable(late, adapter.getSnapshot())).goalsFor, 1,
    "same-scope source reconciliation does not reset already accepted facts");
  emit(patchFixture({ id: "101", providerId: "101" }, 8));
  assert.deepEqual(adapter.getSnapshot()?.fixtures.map(fact => fact.providerFixtureId), ["100", "101"],
    "updated canonical admission allows newly discovered fixture without remounting the reader");
  stop(); emit(read(9)); assert.equal(notified, 4);
});
