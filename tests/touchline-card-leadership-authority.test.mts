import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { advancePlayerLeadershipRead, allowsInheritedCardLeadership, buildTouchlineCardLeadershipValue, inheritedCoachCrown, resetPlayerLeadershipSeed, selectPlayerLeadershipPublication } from "../lib/touchlineArena/card-leadership-authority.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../lib/touchlineArena/card-ranking-live.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

const record = { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 };
const row = { rank: 1, coachProviderId: "42", coachName: "Coach", clubName: "Club", touchlinePoints: 6, wins: 2, draws: 0, losses: 0, awayWins: 1, home: record, away: record };
const coaches: TouchLineCoachRankingState = { phase: "ranked", snapshotId: "snapshot-a", seasonId: "season", scoringVersion: "coach_scoring_v2", fixtureIds: [], generatedAt: null, rows: [row] };
const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

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
  for (const route of ["/arena", "/fantasy", "/touchline-tables", "/touchline-players/haaland", "/touchline-clubs/arsenal"]) assert.equal(allowsInheritedCardLeadership(route), true);
});

test("source contract guards loaders, seeds provider and reuses only the existing singleton feed", () => {
  const boundary = source("components/touchline/cards/TouchlineCardLeadershipBoundary.tsx");
  assert.ok(boundary.indexOf("if (!enabled)") < boundary.indexOf("loadTouchLineActiveRanking()."));
  assert.match(source("app/layout.tsx"), /enabled=\{!isIsolatedPreview && dataSource === "direct"\}/);
  const provider = source("components/touchline/cards/TouchlineCardLeadershipProvider.tsx");
  assert.match(provider, /!allowed \? EMPTY_CARD_LEADERSHIP_AUTHORITY/);
  assert.match(provider, /useTouchlineRankingRead\(livePlayerUpdates && allowed\)/);
  assert.equal((provider.match(/return <AuthorityContext.Provider/g) ?? []).length, 1, "one stable provider tree across allowed and blocked paths");
  assert.match(provider, /resetPlayerLeadershipSeed\(value.playerRanking, getTouchlineRankingReadRevision\(\), getTouchlineRankingRequestEpoch\(\)\)/);
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
