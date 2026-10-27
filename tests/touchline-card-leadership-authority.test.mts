import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { advanceCardLeadershipRead, resetCardLeadershipSeed, resolveCoachCardPoints, advancePlayerLeadershipRead, allowsInheritedCardLeadership, buildTouchlineCardLeadershipValue, inheritedCoachCrown, resetPlayerLeadershipSeed, selectPlayerLeadershipPublication } from "../lib/touchlineArena/card-leadership-authority.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../lib/touchlineArena/card-ranking-live.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

const record = { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 };
const row = { rank: 1, coachProviderId: "42", coachName: "Coach", clubName: "Club", touchlinePoints: 6, wins: 2, draws: 0, losses: 0, awayWins: 1, home: record, away: record };
const coaches: TouchLineCoachRankingState = { phase: "ranked", snapshotId: "snapshot-a", seasonId: "season", scoringVersion: "coach_scoring_v2", fixtureIds: [], generatedAt: null, rows: [row] };
const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("one accepted publication moves coach points/crown and player awards together, including reversed results", () => {
  const player = { ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked" as const, snapshotId: "player-seed", seasonId: "season" };
  let accepted = resetCardLeadershipSeed(buildTouchlineCardLeadershipValue(player, coaches), 1, 1);
  let revision = 1;
  for (const [points, leader, snapshot] of [[3, "42", "winning"], [1, "43", "draw"], [-2, "43", "losing"], [3, "42", "winning"]] as const) {
    revision++;
    const coachRows = [
      { ...row, rank: leader === "42" ? 1 : 2, coachProviderId: "42", touchlinePoints: points },
      { ...row, rank: leader === "43" ? 1 : 2, coachProviderId: "43", touchlinePoints: 2 },
    ].sort((a, b) => a.rank - b.rank);
    const state = { ...player, snapshotId: `player-${snapshot}` };
    const coachRanking = { ...coaches, snapshotId: snapshot, rows: coachRows };
    accepted = advanceCardLeadershipRead(accepted, { state, coachRanking, revision, requestEpoch: revision, publicationDigest: "a".repeat(32) });
    assert.equal(accepted.current.playerRanking, state);
    assert.equal(accepted.current.coachRanking, coachRanking);
    assert.equal(accepted.current.coachLeader?.coachProviderId, leader);
    assert.equal(resolveCoachCardPoints({ authority: accepted.current, liveRankingPoints: true, coachProviderId: "42", slotStatus: "audited", slotPoints: 99 }), points);
    assert.equal(inheritedCoachCrown({ authority: accepted.current, coachProviderId: "42" }), leader === "42");
  }
});

test("coach/player publication preserves scope, mount floors, withdrawals and frozen points", () => {
  const seed = buildTouchlineCardLeadershipValue(null, coaches);
  const original = resetCardLeadershipSeed(seed, 5, 8);
  const read = { state: TOUCHLINE_PRESEASON_RANKING_STATE, coachRanking: coaches, revision: 6, requestEpoch: 9, publicationDigest: "b".repeat(32) };
  assert.equal(advanceCardLeadershipRead(original, null), original);
  assert.equal(advanceCardLeadershipRead(original, { ...read, revision: 5 }), original);
  assert.equal(advanceCardLeadershipRead(original, { ...read, requestEpoch: 8 }), original);
  assert.equal(advanceCardLeadershipRead(original, { ...read, publicationDigest: "bad" }), original);
  assert.equal(advanceCardLeadershipRead(original, { ...read, coachRanking: { ...coaches, seasonId: "other" } }).current, seed);
  const withdrawn = advanceCardLeadershipRead(original, { ...read, coachRanking: null });
  assert.equal(withdrawn.current.coachLeader, null);
  assert.equal(resolveCoachCardPoints({ authority: withdrawn.current, liveRankingPoints: true, coachProviderId: "42", slotStatus: "audited", slotPoints: 99 }), null);
  assert.equal(resolveCoachCardPoints({ authority: withdrawn.current, coachProviderId: "42", slotStatus: "audited", slotPoints: 99 }), 99, "contract/settled slot must not infer live scope");
  assert.equal(advanceCardLeadershipRead(withdrawn, { ...read, revision: 7, coachRanking: { ...coaches, seasonId: "other" } }).current, withdrawn.current);
  for (const points of [0, -2, 27]) assert.equal(resolveCoachCardPoints({ authority: seed, liveRankingPoints: true, coachProviderId: "42", slotStatus: "audited", slotPoints: 99, publishedTouchlinePoints: points }), points);
  assert.equal(resolveCoachCardPoints({ authority: seed, liveRankingPoints: true, coachProviderId: "missing", slotStatus: "audited", slotPoints: 99 }), null);
  assert.equal(resolveCoachCardPoints({ authority: seed, liveRankingPoints: true, coachProviderId: "42", slotStatus: "audited", slotPoints: 99, editable: true }), 99);
  assert.equal(resolveCoachCardPoints({ authority: null, coachProviderId: "42", slotStatus: "audited", slotPoints: 99 }), 99);
  const reset = resetCardLeadershipSeed(buildTouchlineCardLeadershipValue(null, { ...coaches, seasonId: "new-season" }), 7, 10);
  assert.equal(advanceCardLeadershipRead(reset, { ...read, revision: 8, requestEpoch: 10 }), reset);
});

test("published coach authority follows exact identity and fails closed for absent or ambiguous publication", () => {
  const authority = buildTouchlineCardLeadershipValue(null, coaches);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: "42" }), true);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: "43" }), false);
  for (const state of [null, { ...coaches, snapshotId: null }, { ...coaches, rows: [row, { ...row, coachProviderId: "43" }] }, { ...coaches, phase: "unavailable" as const }]) {
    assert.equal(buildTouchlineCardLeadershipValue(null, state).coachLeader, null);
  }
});

test("explicit weekly awards and opt-outs are preserved; frozen points alone never inherit a live crown", () => {
  const authority = buildTouchlineCardLeadershipValue(null, coaches);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: "42", explicit: false }), false);
  assert.equal(inheritedCoachCrown({ authority: null, coachProviderId: "43", explicit: true, publishedTouchlinePoints: 0 }), true);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: "42", publishedTouchlinePoints: 0 }), false);
  assert.equal(inheritedCoachCrown({ authority, coachProviderId: "42", explicit: true, editable: true }), false);
});

test("editor, audit, isolated and social-studio paths do not inherit public awards", () => {
  for (const route of [null, "/admin", "/admin/social-publications/studio", "/visual-qa/social-rankings-live", "/audit/arena", "/audit-index", "/preview"]) assert.equal(allowsInheritedCardLeadership(route), false);
  for (const route of ["/arena", "/clubowner", "/fantasy", "/rankings", "/touchline-players/haaland", "/touchline-clubs/arsenal"]) assert.equal(allowsInheritedCardLeadership(route), true);
});

test("source contract guards loaders, seeds provider and reuses only the existing singleton feed", () => {
  const boundary = source("components/touchline/cards/TouchlineCardLeadershipBoundary.tsx");
  assert.ok(boundary.indexOf("if (!enabled)") < boundary.indexOf("resolveServerReadWithin(loadTouchLineActiveRanking()"));
  assert.doesNotMatch(source("app/layout.tsx"), /TouchlineCardLeadershipBoundary/);
  assert.match(source("components/touchline/cards/TouchlineCardLeadershipLayout.tsx"), /enabled=\{!isIsolatedPreview && dataSource === "direct"\}/);
  for (const family of ["arena", "my-club", "touchline-clubs", "touchline-coaches"]) {
    assert.match(source(`app/${family}/layout.tsx`), /TouchlineCardLeadershipLayout/);
  }
  // ClubOwner streams its authenticated shell before sporting reads. Its one
  // leadership boundary therefore belongs inside the page's Suspense content.
  const clubOwner = source("app/clubowner/page.tsx");
  assert.doesNotMatch(source("app/clubowner/layout.tsx"), /TouchlineCardLeadershipLayout/);
  assert.equal((clubOwner.match(/<TouchlineCardLeadershipLayout>/g) ?? []).length, 1);
  assert.match(clubOwner, /<Suspense\b[^>]*fallback=\{<TouchlineAccountLoading contentOnly \/>\}>\s*<TouchlineCardLeadershipLayout>\s*<ClubOwnerDeferredContent content=\{content\} \/>\s*<\/TouchlineCardLeadershipLayout>\s*<\/Suspense>/);
  const provider = source("components/touchline/cards/TouchlineCardLeadershipProvider.tsx");
  assert.match(provider, /!allowed \? EMPTY_CARD_LEADERSHIP_AUTHORITY/);
  assert.match(provider, /useTouchlineRankingRead\(liveUpdates && allowed\)/);
  assert.equal((provider.match(/return <AuthorityContext.Provider/g) ?? []).length, 1, "one stable provider tree across allowed and blocked paths");
  assert.match(provider, /resetCardLeadershipSeed\(value, getTouchlineRankingReadRevision\(\), getTouchlineRankingRequestEpoch\(\)\)/);
  assert.doesNotMatch(provider, /<[^>]+\bkey=/, "publication changes must never remount gameplay descendants");
  assert.match(provider, /livePlayerUpdates = false/);
  assert.doesNotMatch(provider, /fetch\(|setInterval|localStorage/);
  const player = source("components/touchline/cards/TouchlineEliteExactCard.tsx");
  assert.match(player, /useTouchlineActiveRanking\(!leadershipAuthority && subscribeToRanking\)/);
  assert.match(player, /leadershipAuthority \? leadershipAuthority.playerRanking : fallbackRanking/);
  assert.doesNotMatch(source("components/touchline/cards/TouchlineCoachCardZoom.tsx"), /showLeadershipCrown = false/);
});

test("completed reads recover empty seed, withdraw crown and retain high-water publication across errors and rollbacks", () => {
  const ranked = (snapshotId: string, hour: number) => ({ ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked" as const, snapshotId, seasonId: "season", publishedAt: `2026-09-24T${hour}:00:00Z` });
  let accepted = resetPlayerLeadershipSeed(null, 4, 4);
  const b = ranked("b", 12); const c = ranked("c", 13);
  assert.equal(advancePlayerLeadershipRead(accepted, { state: b, revision: 4, requestEpoch: 4 }), accepted, "old module store cannot replace mount seed");
  accepted = advancePlayerLeadershipRead(accepted, { state: b, revision: 5, requestEpoch: 5 });
  assert.equal(accepted.current, b, "empty server seed recovers on completed valid response");
  accepted = advancePlayerLeadershipRead(accepted, { state: c, revision: 6, requestEpoch: 6 });
  accepted = advancePlayerLeadershipRead(accepted, { state: b, revision: 7, requestEpoch: 7 });
  assert.equal(accepted.current, c, "C cannot roll back to B even if B is newer than original seed");
  assert.equal(advancePlayerLeadershipRead(accepted, null), accepted, "network error has no completed read");
  accepted = advancePlayerLeadershipRead(accepted, { state: TOUCHLINE_PRESEASON_RANKING_STATE, revision: 8, requestEpoch: 8 });
  assert.equal(accepted.current?.phase, "preseason", "successful unavailable response withdraws the award");
  accepted = advancePlayerLeadershipRead(accepted, { state: b, revision: 9, requestEpoch: 9 });
  assert.equal(accepted.current?.phase, "preseason", "withdrawal does not erase rollback watermark");
  const d = ranked("d", 14);
  accepted = advancePlayerLeadershipRead(accepted, { state: d, revision: 10, requestEpoch: 10 });
  assert.equal(accepted.current, d);
  const newSeed = ranked("server-new", 15);
  const reconciled = resetPlayerLeadershipSeed(newSeed, 10, 11);
  assert.equal(reconciled.current, newSeed);
  assert.equal(advancePlayerLeadershipRead(reconciled, { state: d, revision: 10, requestEpoch: 10 }), reconciled);
  assert.equal(advancePlayerLeadershipRead(reconciled, { state: TOUCHLINE_PRESEASON_RANKING_STATE, revision: 11, requestEpoch: 11 }), reconciled, "pre-reset in-flight unavailable result cannot erase new seed");
  assert.equal(advancePlayerLeadershipRead(reconciled, { state: TOUCHLINE_PRESEASON_RANKING_STATE, revision: 12, requestEpoch: 12 }).current?.phase, "preseason", "later-started valid withdrawal is authoritative");
});

test("live player feed cannot roll back or cross the seeded publication scope", () => {
  const seed = { ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked" as const, snapshotId: "seed", seasonId: "season", publishedAt: "2026-09-24T12:00:00Z" };
  for (const live of [null, TOUCHLINE_PRESEASON_RANKING_STATE, { ...seed, snapshotId: "old", publishedAt: "2026-09-23T12:00:00Z" }, { ...seed, seasonId: "other" }, { ...seed, leagueKey: "other" }, { ...seed, publishedAt: "bad" }, { ...seed, snapshotId: "equal-time-other" }]) assert.equal(selectPlayerLeadershipPublication(seed, live), seed);
  const newer = { ...seed, snapshotId: "new", publishedAt: "2026-09-24T12:01:00Z" };
  assert.equal(selectPlayerLeadershipPublication(seed, newer), newer);
  assert.equal(selectPlayerLeadershipPublication(seed, seed), seed);
  assert.equal(selectPlayerLeadershipPublication(null, newer), null);
});

test("authoritative shared publications accept deduplicated corrections but preserve season and request floors", () => {
  const latest = { ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked" as const, snapshotId: "latest",
    seasonId: "season", publishedAt: "2026-10-23T10:00:00Z" };
  const corrected = { ...latest, snapshotId: "before-goal", publishedAt: "2026-10-23T09:00:00Z" };
  const initial = resetPlayerLeadershipSeed(latest, 3, 3);
  const next = { state: corrected, revision: 4, requestEpoch: 4, publicationDigest: "a".repeat(32) };
  assert.equal(advancePlayerLeadershipRead(initial, next).current, corrected);
  assert.equal(advancePlayerLeadershipRead(initial, { ...next, requestEpoch: 3 }), initial);
  assert.equal(advancePlayerLeadershipRead(initial, { ...next, state: { ...corrected, seasonId: "other" } }).current, latest);
  assert.equal(advancePlayerLeadershipRead(initial, { ...next, publicationDigest: undefined }).current, latest, "legacy reads retain their existing high-water rule");
});
