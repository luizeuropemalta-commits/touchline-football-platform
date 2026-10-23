import assert from "node:assert/strict";
import test from "node:test";
import { createTouchlinePublishedLiveReader, createTouchlineSportsPublicationReader } from "../lib/touchlineArena/sports-publication-reader.ts";
import { projectTouchlinePublishedLive } from "../lib/touchlineArena/sports-publication-live-view.ts";
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
