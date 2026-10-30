import assert from "node:assert/strict";
import test from "node:test";
import { createTouchlinePublishedLiveReader, createTouchlineSportsPublicationReader } from "../lib/touchlineArena/sports-publication-reader.ts";
import { projectTouchlinePublishedLive, selectTouchlinePublishedRailFixtures } from "../lib/touchlineArena/sports-publication-live-view.ts";
import { parseTouchlineLivePresentationState, touchlineLiveFreshness } from "../lib/touchlineArena/live-presentation-state.ts";
import type { TouchlinePresentationRead, createTouchlineLivePresentationStore } from "../lib/touchlineArena/live-presentation-client-store.ts";

const NOW = Date.parse("2026-10-23T08:00:00Z");
const stamp = new Date(NOW).toISOString();
const fixture = (id = "100", homeScore = 2) => ({ id, providerId: id, homeScore, awayScore: 1, status: "1H", startsAt: stamp,
  homeTeam: { id: "1", providerId: "1", name: "Home" }, awayTeam: { id: "2", providerId: "2", name: "Away" } });
const read = (epoch = 5): TouchlinePresentationRead => ({
  generation: epoch, requestEpoch: epoch, receivedAt: NOW,
  state: { version: 1, available: true, playerRankingSnapshotId: null, coachRankingSnapshotId: null,
    livePresentationSnapshotId: "a".repeat(32), mode: "live", pollAfterMs: 10_000, resumeAt: null,
    liveFreshness: { fetchedAt: stamp, ageMs: 1_000, degraded: false } },
  sportsPublication: { version: 1, scopeKey: "touchline-england", publication: {
    snapshotId: "10000000-0000-4000-8000-000000000001", contentDigest: "a".repeat(32), publishedAt: stamp,
    playerRankingSnapshotId: null, coachRankingSnapshotId: null, liveScoreSnapshotDigest: "b".repeat(32),
  }, playerRanking: null, coachRanking: null, live: { fetchedAt: stamp, fixtures: [fixture()] } },
});

test("next-match opt-in accepts only a valid same-fixture kickoff through the real reader", () => {
  const original = { ...fixture(), competitionId: "8", seasonId: "season-a", roundId: "9",
    status: "Not Started", startsAt: "2026-11-01T17:00:00Z", venue: { id: "stadium", name: "Original stadium" } };
  const revised = "2026-11-02T20:00:00Z";
  const listeners = new Set<(value: TouchlinePresentationRead) => void>();
  const store = { getRequestEpoch: () => 0, revalidate() {},
    subscribe(listener: (value: TouchlinePresentationRead) => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    } } as unknown as ReturnType<typeof createTouchlineLivePresentationStore>;
  const reader = createTouchlinePublishedLiveReader(store, [original], null, null, true);
  const unchanged = createTouchlinePublishedLiveReader(store, [original], null);
  const stop = reader.subscribe(() => {}), stopDefault = unchanged.subscribe(() => {});
  const publication = (replacement: typeof original, epoch = 1) => {
    const value = read(epoch);
    return { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp,
      fixtures: [replacement, { ...replacement, id: "other", providerId: "other" }] } } };
  };
  for (const invalid of ["bad", "2026-11-02T20:00:00", "2026-02-30T20:00:00Z"]) {
    const value = publication({ ...original, startsAt: invalid });
    assert.equal(projectTouchlinePublishedLive([original], null, value, NOW, null, null, true).fixtures[0].startsAt, original.startsAt);
  }
  for (const foreign of [{ seasonId: "season-b" }, { competitionId: "9" }, { providerId: "different" },
    { homeTeam: { ...original.homeTeam, providerId: "other-team" } }, { awayTeam: { ...original.awayTeam, providerId: "other-team" } }]) {
    const value = publication({ ...original, startsAt: revised, ...foreign });
    assert.equal(projectTouchlinePublishedLive([original], null, value, NOW, null, null, true).fixtures[0].startsAt, original.startsAt);
  }
  const next = publication({ ...original, startsAt: revised, roundId: "99", venue: { id: "other", name: "Other stadium" } });
  for (const listener of listeners) listener(next);
  const view = reader.getSnapshot();
  assert.equal(view.fixtures.length, 1, "does not admit another fixture");
  assert.equal(view.fixtures[0].startsAt, revised);
  assert.equal(view.fixtures[0].roundId, original.roundId);
  assert.deepEqual(view.fixtures[0].venue, original.venue);
  assert.equal(unchanged.getSnapshot().fixtures[0].startsAt, original.startsAt, "default consumers keep the SSR schedule");
  assert.equal(projectTouchlinePublishedLive(view.fixtures, view.metadata, view.read, NOW, null, null, true).fixtures[0].startsAt, revised);
  const missing = { ...read(2), sportsPublication: { ...read(2).sportsPublication!, live: { fetchedAt: stamp, fixtures: [] } } };
  for (const listener of listeners) listener(missing);
  assert.equal(reader.getSnapshot().fixtures[0].startsAt, revised, "omission does not undo the accepted correction");
  stop(); stopDefault();
});

test("mount reader ignores cached and pre-mount reads; requests fresh signal and whole payload", () => {
  const listeners = new Set<(value: TouchlinePresentationRead) => void>();
  let revalidations = 0; let notifications = 0;
  const fakeStore = { getRequestEpoch: () => 4, getSnapshot: () => read(3), revalidate: () => { revalidations++; },
    subscribe(listener: (value: TouchlinePresentationRead) => void, includeSports: boolean) {
      assert.equal(includeSports, true); listeners.add(listener); return () => { listeners.delete(listener); };
    } } as unknown as ReturnType<typeof createTouchlineLivePresentationStore>;
  const adapter = createTouchlineSportsPublicationReader(fakeStore);
  assert.equal(adapter.getSnapshot(), null, "global cache must not overwrite SSR");
  const stop = adapter.subscribe(() => { notifications++; });
  const emit = (value: TouchlinePresentationRead) => { for (const listener of listeners) listener(value); };
  emit(read(4)); assert.equal(revalidations, 1); assert.equal(notifications, 0);
  const fresh = read(5); emit(fresh); assert.equal(adapter.getSnapshot(), fresh); assert.equal(notifications, 1);
  const mismatched = { ...read(6), state: { ...read(6).state, livePresentationSnapshotId: "c".repeat(32) } };
  emit(mismatched); assert.equal(adapter.getSnapshot(), fresh);
  const missingFreshness = { ...read(6), state: { ...read(6).state, liveFreshness: null } };
  emit(missingFreshness); assert.equal(adapter.getSnapshot(), fresh);
  const mismatchedTime = { ...read(6), state: { ...read(6).state,
    liveFreshness: { fetchedAt: "2026-10-24T08:00:00Z", ageMs: 0, degraded: false } } };
  emit(mismatchedTime); assert.equal(adapter.getSnapshot(), fresh);
  stop(); emit(read(7)); assert.equal(notifications, 1);
});

test("signal freshness ages without changing a digest and never fabricates an update time", () => {
  const payload = { fixtures: [fixture()], storedAt: NOW, fetchedAt: stamp };
  assert.deepEqual(touchlineLiveFreshness(payload, NOW + 300_000), { fetchedAt: stamp, ageMs: 300_000, degraded: false });
  assert.deepEqual(touchlineLiveFreshness(payload, NOW + 300_001), { fetchedAt: stamp, ageMs: 300_001, degraded: true });
  assert.equal(touchlineLiveFreshness(payload, NOW - 1)!.degraded, true, "future write timestamps are not fresh evidence");
  assert.equal(touchlineLiveFreshness({ ...payload, fetchedAt: "2026-10-24T08:00:00Z" }, NOW)!.degraded, true, "future capture timestamps are not fresh evidence");
  assert.equal(touchlineLiveFreshness({ ...payload, fetchedAt: "2026-10-22T08:00:00Z" }, NOW)!.degraded, true, "repersisting old captured data does not renew freshness");
  assert.equal(touchlineLiveFreshness({ ...payload, fixtures: [] }, NOW)!.degraded, true);
  for (const invalid of [null, {}, { ...payload, storedAt: NaN }, { ...payload, fetchedAt: "invalid" }, { ...payload, storedAt: -1 }]) {
    assert.equal(touchlineLiveFreshness(invalid, NOW), null);
  }
  for (const invalid of [{ ageMs: -1, fetchedAt: stamp, degraded: true }, { ageMs: 300_001, fetchedAt: stamp, degraded: false },
    { ageMs: 0, fetchedAt: "invalid", degraded: true }, { ageMs: Infinity, fetchedAt: stamp, degraded: true }]) {
    assert.equal(parseTouchlineLivePresentationState({ ...read().state, liveFreshness: invalid }), null);
  }
});

test("Live projection preserves SSR schedule/venue and accepts downward corrections without duplicates", () => {
  const venue = { id: "stadium", name: "Home stadium", homeClubName: "Home", imageUrl: "/stadium.webp" };
  const original = { ...fixture(), id: "sportmonks:100", homeScore: 3, venue };
  const upcoming = { ...fixture("200"), homeScore: undefined, awayScore: undefined, startsAt: "2026-10-24T08:00:00Z", status: "NS" };
  const seed = [original, upcoming];
  const initialMetadata = { state: "partial-persisted-schedule" as const, degraded: true };
  assert.deepEqual(projectTouchlinePublishedLive(seed, initialMetadata, null, NOW), { fixtures: seed, metadata: initialMetadata });
  const result = projectTouchlinePublishedLive(seed, initialMetadata, read(), NOW);
  assert.equal(result.fixtures.length, 2);
  assert.equal(result.fixtures[0].homeScore, 2);
  assert.equal(result.fixtures[0].venue, venue);
  assert.equal(result.fixtures[1], upcoming);
  assert.equal(original.homeScore, 3, "SSR seed remains immutable");
  assert.deepEqual(result.metadata, { state: "persisted-live-snapshot", fetchedAt: stamp, degraded: false });
  const stale = projectTouchlinePublishedLive(seed, initialMetadata, read(), NOW + 300_000);
  assert.equal(stale.metadata!.degraded, true);
  assert.equal(stale.fixtures[0].homeScore, 2, "staleness does not erase verified scores");
  assert.equal(stale.metadata!.fetchedAt, stamp, "receiving an HTTP response does not refresh provider time");
});

test("a wider live window cannot change the page's round, teams, fixture identity or venue", () => {
  const seed = [{ ...fixture(), id: "sportmonks:100", roundId: "7", roundName: "7" }];
  const publication = read();
  const next = { ...publication, sportsPublication: { ...publication.sportsPublication!, live: {
    fetchedAt: stamp, fixtures: [{ ...fixture(), roundId: "99", startsAt: "2026-10-30T08:00:00Z" }, fixture("999")],
  } } };
  const result = projectTouchlinePublishedLive(seed, null, next, NOW);
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].id, "sportmonks:100");
  assert.equal(result.fixtures[0].roundId, "7");
  assert.equal(result.fixtures[0].startsAt, stamp);
  const switchedTeams = { ...next, sportsPublication: { ...next.sportsPublication, live: {
    fetchedAt: stamp, fixtures: [{ ...fixture(), homeTeam: { id: "3", providerId: "3", name: "Wrong" } }],
  } } };
  assert.equal(projectTouchlinePublishedLive(seed, null, switchedTeams, NOW).fixtures[0], seed[0]);
});

test("mounted Live and ClubHub retain corrected facts when a wider publication omits the match", () => {
  const listeners = new Set<(value: TouchlinePresentationRead) => void>();
  const store = { getRequestEpoch: () => 0, revalidate() {},
    subscribe(listener: (value: TouchlinePresentationRead) => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    } } as unknown as ReturnType<typeof createTouchlineLivePresentationStore>;
  const seed = [{ ...fixture("100", 0), awayScore: 0 }];
  const live = createTouchlinePublishedLiveReader(store, seed, null);
  const club = createTouchlinePublishedLiveReader(store, seed, null);
  const stops = [live.subscribe(() => {}), club.subscribe(() => {})];
  const publish = (fixtures: ReturnType<typeof fixture>[], epoch: number) => {
    const value = read(epoch);
    for (const listener of listeners) listener({ ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures } } });
  };
  publish([fixture("100", 3)], 1);
  publish([fixture("100", 2)], 2); // VAR: authoritative correction down.
  publish([fixture("999", 5)], 3);
  for (const view of [live, club]) {
    assert.equal(view.getSnapshot().fixtures[0].homeScore, 2, "must not revert to initial 0");
    assert.equal(view.getSnapshot().metadata!.degraded, true, "an omitted score is not newly verified");
    assert.equal(view.getServerSnapshot().fixtures[0].homeScore, 0, "SSR seed remains untouched");
  }
  publish([], 4);
  assert.equal(club.getSnapshot().fixtures[0].homeScore, 2);
  publish([{ ...fixture("100", 1), status: "FT" }], 5);
  assert.equal(live.getSnapshot().fixtures[0].homeScore, 1);
  assert.equal(live.getSnapshot().fixtures[0].status, "FT");
  assert.equal(live.getSnapshot().metadata!.degraded, false);
  const otherScope = createTouchlinePublishedLiveReader(store, [fixture("200", 7)], null);
  assert.equal(otherScope.getSnapshot().fixtures[0].homeScore, 7, "no cross-route replay");
  for (const stop of stops) stop();
  publish([fixture("100", 6)], 6);
  assert.equal(live.getSnapshot().fixtures[0].homeScore, 1, "unmounted reader cannot advance");
});

test("withdrawn facts clear explicitly but missing canonical teams cannot overwrite a fixture", () => {
  const current = { ...fixture(), liveMinute: 12 };
  const value = read();
  const cleared = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp,
    fixtures: [{ ...fixture(), homeScore: undefined, awayScore: undefined, status: "NS" }] } } };
  const result = projectTouchlinePublishedLive([current], null, cleared, NOW);
  assert.equal(result.fixtures[0].homeScore, undefined);
  assert.equal(result.fixtures[0].liveMinute, undefined);
  const noTeams = { id: "100", providerId: "100", homeScore: 7 };
  const unsafe = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures: [noTeams] } } };
  assert.equal(projectTouchlinePublishedLive([noTeams], null, unsafe, NOW).fixtures[0], noTeams);
  assert.equal(projectTouchlinePublishedLive([current], null, unsafe, NOW).fixtures[0], current);
});


test("only the opted-in strip admits new in-play fixtures in its explicit current-season scope", () => {
  const scoped = (id: string, status = "In Play") => ({ ...fixture(id), status, competitionId: "8", seasonId: "season-a", roundId: "8", roundName: "8" });
  const seed = [scoped("100", "FT")];
  const value = read();
  const publication = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp,
    fixtures: [scoped("200"), scoped("200"), scoped("300", "NS"), { ...scoped("400"), competitionId: "9" },
      { ...scoped("500"), seasonId: "season-b" }, { ...scoped("600"), startsAt: "2026-10-24T08:00:00Z" },
      { ...scoped("700"), awayTeam: scoped("700").homeTeam }],
  } } };
  assert.deepEqual(projectTouchlinePublishedLive(seed, null, publication, NOW).fixtures.map(f => f.providerId), ["100"]);
  const admitted = projectTouchlinePublishedLive(seed, null, publication, NOW, { competitionId: "8", seasonId: "season-a" });
  assert.deepEqual(admitted.fixtures.map(f => f.providerId), ["100", "200"]);
  assert.equal(admitted.metadata!.degraded, true, "omitted historical facts are not newly verified");
  assert.equal(projectTouchlinePublishedLive([], null, publication, NOW).fixtures.length, 0, "no scope means no expansion");
  assert.equal(projectTouchlinePublishedLive([], null, publication, NOW, { competitionId: "8", seasonId: "season-a" }).fixtures.length, 1);
  const mixed = [seed[0], { ...scoped("101", "FT"), seasonId: "other" }];
  assert.equal(projectTouchlinePublishedLive(mixed, null, publication, NOW, { competitionId: "8", seasonId: "season-a" }).fixtures.length, 3);
  const previousSeason = [{ ...seed[0], seasonId: "previous-season" }];
  const rollover = projectTouchlinePublishedLive(previousSeason, null, publication, NOW, { competitionId: "8", seasonId: "season-a" });
  assert.deepEqual(rollover.fixtures.map(f => f.providerId), ["100", "200"]);
  assert.equal(rollover.fixtures[0].seasonId, "previous-season");
  for (const invalidScope of [{ competitionId: "9", seasonId: "season-a" }, { competitionId: "8", seasonId: "" },
    { competitionId: "8", seasonId: "   " }, { competitionId: "8", seasonId: null }]) {
    assert.equal(projectTouchlinePublishedLive(seed, null, publication, NOW, invalidScope as never).fixtures.length, 1);
  }
  const foreignSameId = { ...publication, sportsPublication: { ...publication.sportsPublication, live: { fetchedAt: stamp,
    fixtures: [{ ...scoped("100"), competitionId: "9", homeScore: 99 }] } } };
  assert.equal(projectTouchlinePublishedLive(seed, null, foreignSameId, NOW, { competitionId: "8", seasonId: "season-a" }).fixtures[0], seed[0]);
});

test("strip keeps current-round finals, advances as a group, and never mixes a focused old result", () => {
  const scope = { competitionId: "8" as const, seasonId: "season-a" };
  const listeners = new Set<(value: TouchlinePresentationRead) => void>();
  const store = { getRequestEpoch: () => 0, revalidate() {},
    subscribe(listener: (value: TouchlinePresentationRead) => void) {
      listeners.add(listener); return () => { listeners.delete(listener); };
    } } as unknown as ReturnType<typeof createTouchlineLivePresentationStore>;
  const round = (number: number, status: string) => Array.from({ length: 10 }, (_, i) => ({
    ...fixture(String(number * 100 + i)), ...scope, roundId: String(number), roundName: String(number), status,
    startsAt: new Date(NOW + (number - 8) * 7 * 86_400_000).toISOString(),
    homeTeam: { id: String(i*2+1), providerId: String(i*2+1), name: `Home ${i}` },
    awayTeam: { id: String(i*2+2), providerId: String(i*2+2), name: `Away ${i}` },
  }));
  const current = round(8, "FT"); current[9].status = "In Play";
  const next = round(9, "Not Started");
  const seed = [...round(7, "FT"), ...current, ...next];
  const strip = createTouchlinePublishedLiveReader(store, seed, null, scope);
  const stop = strip.subscribe(() => {});
  const publish = (fixtures: typeof seed, epoch: number, valid = true) => {
    const value = read(epoch);
    for (const listener of listeners) listener({ ...value,
      state: { ...value.state, livePresentationSnapshotId: valid ? value.state.livePresentationSnapshotId : "c".repeat(32) },
      sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures } } });
  };
  const visible = (focus: string | null = null) => selectTouchlinePublishedRailFixtures(strip.getSnapshot().fixtures, NOW, focus, scope);
  assert.deepEqual(visible().map(f => f.providerId), current.map(f => f.providerId));
  publish([{ ...current[9], status: "FT", homeScore: 4 }], 1, false);
  assert.equal(visible()[9].status, "In Play", "unvalidated publication cannot close the round");
  publish([{ ...current[9], status: "FT", homeScore: 4 }], 2);
  assert.deepEqual(visible().map(f => f.providerId), next.map(f => f.providerId));
  const focused = visible("809");
  assert.equal(focused.length, 10);
  assert.ok(focused.every(f => f.roundId === "8"), "focus retains the entire old round, never an eleventh link");
  assert.equal(focused[9].homeScore, 4);
  publish([], 3);
  assert.deepEqual(visible().map(f => f.providerId), next.map(f => f.providerId), "omission cannot roll back accepted completion");
  assert.equal(strip.getSnapshot().fixtures.length, 30, "future catalogue survives projection");
  assert.equal(strip.getServerSnapshot().fixtures[19].status, "In Play", "SSR seed is not mutated");
  stop(); assert.equal(listeners.size, 0);
});

test("historical catalogue facts do not make a freshly covered current round stale", () => {
  const scope = { competitionId: "8" as const, seasonId: "season-a" };
  const old = { ...fixture("old"), ...scope, roundId: "7", roundName: "7", status: "FT", startsAt: "2026-10-16T08:00:00Z" };
  const current = { ...fixture(), ...scope, roundId: "8", roundName: "8", status: "In Play" };
  const value = read();
  const result = projectTouchlinePublishedLive([old, current], null, { ...value,
    sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures: [current] } } }, NOW, scope);
  assert.equal(result.metadata?.degraded, false);
  assert.deepEqual(selectTouchlinePublishedRailFixtures(result.fixtures, NOW, null, scope).map(f => f.providerId), ["100"]);
});

const freshnessScope = { competitionId: "8" as const, seasonId: "season-a" };
function freshnessRound(number: number, status: string) {
  return Array.from({ length: 10 }, (_, index) => ({
    ...fixture(`${number}-${index}`), ...freshnessScope, roundId: String(number), roundName: String(number), status,
    startsAt: new Date(NOW + (number - 8) * 7 * 86_400_000).toISOString(),
    homeScore: status === "Not Started" ? undefined : 2,
    awayScore: status === "Not Started" ? undefined : 1,
    homeTeam: { id: `team-${index * 2}`, providerId: `team-${index * 2}`, name: `Home ${index}` },
    awayTeam: { id: `team-${index * 2 + 1}`, providerId: `team-${index * 2 + 1}`, name: `Away ${index}` },
  }));
}

test("freshness follows the whole focused round instead of the newly covered next round", () => {
  const previous = freshnessRound(8, "FT"), next = freshnessRound(9, "Not Started");
  const seed = [...previous, ...next], original = structuredClone(seed);
  const oldMetadata = { state: "persisted-live-snapshot" as const, degraded: true, fetchedAt: "2026-10-22T08:00:00Z" };
  const value = read();
  const publication = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures: next } } };
  const unfocused = projectTouchlinePublishedLive(seed, oldMetadata, publication, NOW, freshnessScope);
  assert.equal(unfocused.metadata?.degraded, false, "all ten displayed next-round fixtures are covered");
  assert.equal(unfocused.metadata?.fetchedAt, stamp);

  // The hook projects its accepted catalogue again when focus changes. It must
  // not reuse that next-round freshness for the older round retained by focus.
  const focused = projectTouchlinePublishedLive(unfocused.fixtures, unfocused.metadata, publication, NOW, freshnessScope, previous[4].providerId);
  const displayed = selectTouchlinePublishedRailFixtures(focused.fixtures, NOW, previous[4].providerId, freshnessScope);
  assert.deepEqual(displayed.map(row => row.providerId), previous.map(row => row.providerId));
  assert.equal(focused.metadata?.degraded, true, "omitted focused facts are not freshly verified");
  assert.equal(displayed[4].homeScore, 2, "fencing freshness must preserve the result and focused link");
  const blurred = projectTouchlinePublishedLive(focused.fixtures, focused.metadata, publication, NOW, freshnessScope);
  assert.equal(blurred.metadata?.degraded, false);
  assert.deepEqual(selectTouchlinePublishedRailFixtures(blurred.fixtures, NOW, null, freshnessScope).map(row => row.providerId), next.map(row => row.providerId));
  assert.deepEqual(seed, original, "focus and blur do not mutate the server catalogue");
});

test("advancing to an omitted scoreless schedule round cannot inherit the closing round's freshness", () => {
  const current = freshnessRound(8, "FT"), next = freshnessRound(9, "Not Started");
  current[9].status = "In Play";
  const seed = [...current, ...next], original = structuredClone(seed);
  const value = read();
  const completed = current.map(row => ({ ...row, status: "FT" }));
  const publication = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures: completed } } };
  const advanced = projectTouchlinePublishedLive(seed, null, publication, NOW, freshnessScope);
  const displayed = selectTouchlinePublishedRailFixtures(advanced.fixtures, NOW, null, freshnessScope);
  assert.deepEqual(displayed.map(row => row.providerId), next.map(row => row.providerId));
  assert.ok(displayed.every(row => row.homeScore === undefined && row.awayScore === undefined));
  assert.equal(advanced.metadata?.degraded, true, "absence of scores does not establish publication coverage");

  const covered = { ...value, sportsPublication: { ...value.sportsPublication!, live: { fetchedAt: stamp, fixtures: next } } };
  const recovered = projectTouchlinePublishedLive(advanced.fixtures, advanced.metadata, covered, NOW, freshnessScope);
  assert.equal(recovered.metadata?.degraded, false, "a later receipt covering the actual displayed round can restore freshness");
  assert.equal(recovered.metadata?.fetchedAt, stamp);
  assert.equal(recovered.fixtures.length, 20, "completion and recovery retain the full catalogue");
  assert.deepEqual(seed, original, "the original live fixture and scoreless schedule remain immutable");
});
