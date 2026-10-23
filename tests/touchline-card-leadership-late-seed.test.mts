import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTouchlineCardLeadershipValue,
  resetCardLeadershipSeed,
  type TouchlineCardLeadershipAuthority,
} from "../lib/touchlineArena/card-leadership-authority.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../lib/touchlineArena/card-ranking-live.ts";
import {
  reconcileCardLeadershipSeed,
  type CardLeadershipSeedState,
} from "../lib/touchlineArena/card-leadership-seed-state.ts";

const scope = JSON.stringify(["/touchline-players/player", true, true, false, "season-1"]);
const playerId = "10000000-0000-4000-8000-000000000001";
function authority(snapshot: string, seasonId = "season-1", totalRating = 42) {
  return buildTouchlineCardLeadershipValue({
    ...TOUCHLINE_PRESEASON_RANKING_STATE,
    phase: "ranked",
    snapshotId: snapshot,
    seasonId,
    publishedAt: "2026-10-23T12:00:00.000Z",
    scoringVersion: "player_scoring_v4",
    players: [{ playerId, providerPlayerId: "106", totalRating, positionGroup: "striker", positionRank: 1,
      groupSize: 1, minutesPlayed: 90, appearances: 1, tierKey: "radiant-gold", priceTc: 999 }],
  }, null);
}
function initial(value: TouchlineCardLeadershipAuthority | null = authority("A")): CardLeadershipSeedState {
  return { seedKey: "A", scopeKey: scope, hasAcceptedRead: false,
    state: resetCardLeadershipSeed(value ?? buildTouchlineCardLeadershipValue(null, null), 1, 1) };
}
function completed(value: TouchlineCardLeadershipAuthority, revision: number, requestEpoch = revision) {
  return { state: value.playerRanking ?? TOUCHLINE_PRESEASON_RANKING_STATE, coachRanking: value.coachRanking ?? null,
    revision, requestEpoch, publicationDigest: revision.toString(16).padStart(32, "0") };
}
function step(previous: CardLeadershipSeedState, changes: Partial<Parameters<typeof reconcileCardLeadershipSeed>[1]> = {}) {
  return reconcileCardLeadershipSeed(previous, { seedKey: previous.seedKey, scopeKey: previous.scopeKey,
    value: previous.state.current, read: null, revision: previous.state.revision, requestFloor: previous.state.requestFloor,
    ...changes });
}

test("a late SSR B cannot roll accepted C back or advance its request floor", () => {
  const a = authority("A"), b = authority("B", "season-1", 43), c = authority("C", "season-1", 44);
  const accepted = step(initial(a), { read: completed(c, 3) });
  assert.equal(accepted.state.current.playerRanking?.snapshotId, "C");
  // Reproduces the old provider branch: resetting any changed seed yields B.
  assert.equal(resetCardLeadershipSeed(b, 3, 3).current.playerRanking?.snapshotId, "B");
  const reconciled = step(accepted, { seedKey: "B", value: b, read: completed(c, 3), revision: 3, requestFloor: 3 });
  assert.equal(reconciled.seedKey, "B", "remember the received seed without adopting its unordered facts");
  assert.equal(reconciled.state.current, accepted.state.current);
  assert.equal(reconciled.state.requestFloor, 1);
  assert.equal(step(reconciled, { value: b }), reconciled, "stable SSR props must not cause render loops");
  const returnedA = step(reconciled, { seedKey: "A", value: a, revision: 3, requestFloor: 3 });
  assert.equal(returnedA.state.current, accepted.state.current, "the SSR A to B to A sequence still cannot replace C");
  assert.equal(returnedA.state.requestFloor, 1);
  const d = authority("D", "season-1", 45);
  assert.equal(step(returnedA, { value: a, read: completed(d, 4) }).state.current.playerRanking, d.playerRanking);
  assert.equal(a.playerRanking?.players[0]?.totalRating, 42);
  assert.equal(b.playerRanking?.players[0]?.totalRating, 43);
});

test("a completed C arriving with the older seed B wins in the same render", () => {
  const c = authority("C", "season-1", 44);
  const actual = step(initial(), { seedKey: "B", value: authority("B"), read: completed(c, 3), revision: 3, requestFloor: 3 });
  assert.equal(actual.hasAcceptedRead, true);
  assert.equal(actual.state.current.playerRanking, c.playerRanking);
  assert.equal(actual.state.requestFloor, 1);
});

test("confirmed withdrawal survives late SSR, and a subsequent reversal can reactivate an older snapshot", () => {
  const c = authority("C", "season-1", 50);
  const accepted = step(initial(), { read: completed(c, 3) });
  const absent = buildTouchlineCardLeadershipValue(TOUCHLINE_PRESEASON_RANKING_STATE, null);
  const withdrawn = step(accepted, { read: completed(absent, 4) });
  assert.equal(withdrawn.state.current.playerRanking?.phase, "preseason");
  assert.equal(withdrawn.state.current.coachRanking, null);
  assert.equal(withdrawn.state.seasonId, "season-1");
  const late = step(withdrawn, { seedKey: "B", value: authority("B"), revision: 4, requestFloor: 4 });
  assert.equal(late.state.current, withdrawn.state.current);
  const older = authority("A", "season-1", 40);
  const reactivated = step(late, { value: authority("B"), read: completed(older, 5) });
  assert.equal(reactivated.state.current.playerRanking, older.playerRanking);
  assert.equal(reactivated.state.current.playerRanking?.players[0]?.totalRating, 40);
});

test("empty seeds recover only on post-mount accepted reads and cannot erase one later", () => {
  const empty = initial(null), c = authority("C");
  assert.equal(step(empty, { read: completed(c, 2, 1) }), empty, "the pre-mount in-flight read is not authority");
  const accepted = step(empty, { read: completed(c, 3, 2) });
  assert.equal(accepted.state.current.playerRanking, c.playerRanking);
  const emptyAgain = step(accepted, { seedKey: "empty-later", value: buildTouchlineCardLeadershipValue(null, null), revision: 3, requestFloor: 3 });
  assert.equal(emptyAgain.state.current, accepted.state.current);
  assert.equal(emptyAgain.state.requestFloor, 1);
});

test("a first server season anchor beats a simultaneous other-season read without expectedSeasonId", () => {
  const empty = { ...initial(null), scopeKey: JSON.stringify(["/touchline-clubs/arsenal", true, true, true, null]) };
  assert.equal(empty.state.seasonId, null);
  assert.equal(empty.state.leagueKey, null);
  const server = authority("server-S2", "season-2", 20);
  const oldRead = completed(authority("live-S1", "season-1", 999), 3, 3);
  const anchored = step(empty, { seedKey: "server-S2", value: server, read: oldRead, revision: 3, requestFloor: 3 });
  assert.equal(anchored.state.current, server);
  assert.equal(anchored.state.seasonId, "season-2");
  assert.equal(anchored.state.requestFloor, 3);
  assert.equal(anchored.hasAcceptedRead, false);
  assert.equal(step(anchored, { value: server, read: oldRead }), anchored);
  const wrongAgain = step(anchored, { value: server, read: completed(authority("S1-again", "season-1", 999), 4, 4) });
  assert.equal(wrongAgain.state.current, server);
  assert.equal(wrongAgain.hasAcceptedRead, false);
  const correct = authority("live-S2", "season-2", 21);
  assert.equal(step(wrongAgain, { value: server, read: completed(correct, 5, 5) }).state.current.playerRanking, correct.playerRanking);
});

test("a first server league anchor resets the floor even while its season is absent", () => {
  const empty = initial(null);
  const server = buildTouchlineCardLeadershipValue(TOUCHLINE_PRESEASON_RANKING_STATE, null);
  const wrong = authority("wrong-league");
  const read = completed({ ...wrong, playerRanking: { ...wrong.playerRanking!, leagueKey: "other-league" } }, 3, 3);
  const anchored = step(empty, { seedKey: "known-league", value: server, read, revision: 3, requestFloor: 3 });
  assert.equal(anchored.state.current, server);
  assert.equal(anchored.state.seasonId, null);
  assert.equal(anchored.state.leagueKey, "touchline-england");
  assert.equal(anchored.state.requestFloor, 3);
  assert.equal(anchored.hasAcceptedRead, false);
  const correct = authority("known-league-live");
  assert.equal(step(anchored, { value: server, read: completed(correct, 4, 4) }).state.current.playerRanking, correct.playerRanking);
});

test("unconfigured coach authority stays undefined until an explicit withdrawal is received", () => {
  const unconfigured: TouchlineCardLeadershipAuthority = { playerRanking: null, coachLeader: null };
  const mounted = initial(unconfigured);
  assert.equal(mounted.state.current, unconfigured);
  assert.equal(mounted.state.current.coachRanking, undefined);
  const absent = buildTouchlineCardLeadershipValue(TOUCHLINE_PRESEASON_RANKING_STATE, null);
  const serverWithdrawal = step(mounted, { seedKey: "withdrawn", value: absent, revision: 2, requestFloor: 2 });
  assert.equal(serverWithdrawal.state.current, absent, "SSR is still authoritative before a shared read");
  assert.equal(serverWithdrawal.state.current.coachRanking, null);
  const confirmed = step(mounted, { read: completed(absent, 3) });
  assert.equal(confirmed.state.current.coachRanking, null);
  assert.equal(step(confirmed, { seedKey: "unconfigured-late", value: unconfigured }).state.current, confirmed.state.current);
});

test("late seeds cannot split the accepted player and coach publication", () => {
  const player = authority("C");
  const record = { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 };
  const combined = buildTouchlineCardLeadershipValue(player.playerRanking, {
    phase: "ranked", snapshotId: "coach-C", seasonId: "season-1", scoringVersion: "coach_scoring_v2",
    fixtureIds: [], generatedAt: null,
    rows: [{ rank: 1, coachProviderId: "42", coachName: "Coach", clubName: "Club", touchlinePoints: 6,
      wins: 2, draws: 0, losses: 0, awayWins: 1, home: record, away: record }],
  });
  const accepted = step(initial(), { read: completed(combined, 3) });
  const late = step(accepted, { seedKey: "B", value: authority("B"), revision: 3, requestFloor: 3 });
  assert.equal(late.state.current.playerRanking, combined.playerRanking);
  assert.equal(late.state.current.coachRanking, combined.coachRanking);
  assert.equal(late.state.current.coachLeader?.snapshotId, "coach-C");
});

test("before a completed publication, changed SSR seeds remain usable and invalid reads do not lock them out", () => {
  const b = authority("B");
  const updated = step(initial(null), { seedKey: "B", value: b, revision: 2, requestFloor: 5 });
  assert.equal(updated.state.current, b);
  assert.equal(updated.hasAcceptedRead, false);
  assert.equal(updated.state.requestFloor, 5);
  const rejected = step(updated, { read: completed(authority("wrong", "other-season"), 3, 6) });
  assert.equal(rejected.hasAcceptedRead, false);
  const c = authority("C");
  assert.equal(step(rejected, { seedKey: "C", value: c }).state.current, c);
});

test("a legitimate non-null season change resets authority and protects the new request floor", () => {
  const accepted = step(initial(), { read: completed(authority("C"), 3) });
  const nextSeason = authority("next-season-seed", "season-2", 0);
  const reset = step(accepted, { seedKey: "next-season", value: nextSeason, read: completed(authority("old-flight"), 4), revision: 4, requestFloor: 6 });
  assert.equal(reset.state.current, nextSeason);
  assert.equal(reset.state.seasonId, "season-2");
  assert.equal(reset.hasAcceptedRead, false);
  assert.equal(reset.state.requestFloor, 6);
  const fresh = authority("next-season-live", "season-2", 4);
  assert.equal(step(reset, { value: nextSeason, read: completed(fresh, 5, 6) }), reset);
  assert.equal(step(reset, { value: nextSeason, read: completed(fresh, 5, 7) }).state.current.playerRanking, fresh.playerRanking);
});

test("explicit route/preview/subscription/expected-season scopes reset even with empty seeds", () => {
  const accepted = step(initial(), { read: completed(authority("C"), 3) });
  for (const nextScope of ["blocked-admin", "disabled-preview", "coach-only", "new-player", "expected-season-2"]) {
    const empty = buildTouchlineCardLeadershipValue(null, null);
    const reset = step(accepted, { scopeKey: nextScope, seedKey: `${nextScope}:empty`, value: empty, revision: 3, requestFloor: 4 });
    assert.equal(reset.scopeKey, nextScope);
    assert.equal(reset.state.current, empty);
    assert.equal(reset.hasAcceptedRead, false);
    assert.equal(reset.state.requestFloor, 4);
  }
});

test("the real provider uses reconciliation without keying or adding a transport", () => {
  const source = readFileSync(new URL("../components/touchline/cards/TouchlineCardLeadershipProvider.tsx", import.meta.url), "utf8");
  assert.match(source, /reconcileCardLeadershipSeed\(accepted,/);
  assert.match(source, /liveUpdates \? reconciled\.state\.current : value/);
  assert.match(source, /JSON\.stringify\(\[pathname, allowed, livePlayerUpdates, liveCoachUpdates, expectedSeasonId \?\? null\]\)/);
  assert.match(source, /read\.state\.seasonId !== expectedSeasonId/);
  assert.match(source, /read\.coachRanking\.seasonId !== expectedSeasonId/);
  assert.doesNotMatch(source, /fetch\(|setInterval|setTimeout|localStorage|<[^>]+\bkey=/);
});
