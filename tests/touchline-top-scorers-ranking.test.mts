import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSportmonksSeasonTopScorers } from "../lib/football-data/sportmonks-season-topscorers.ts";
import { resolveGoldenBootEligibility } from "../lib/touchlineArena/golden-boot-eligibility.ts";
import type { FootballDataResult, TouchlineSeasonTopScorers } from "../lib/football-data/types.ts";

const moduleUrl = new URL("../lib/touchlineArena/top-scorers-ranking.ts", import.meta.url);
const now = Date.parse("2026-10-02T11:00:00Z");
const scope = { authority: "canonical-season-stage" as const, leagueId: "8", seasonId: "28083", stageId: "1" };
const raw = (player: number, goals: number, extra = {}) => ({ id: player, player_id: player, participant_id: 9, league_id: 8, season_id: 28083, stage_id: 1, type_id: 208, total: goals, ...extra });
function evidence(rows: unknown[], age = 0): FootballDataResult<TouchlineSeasonTopScorers> {
  const fetchedAt = new Date(now - age).toISOString();
  return { ok: true, provider: "sportmonks", cached: false, fetchedAt, data: {
    requestedSeasonId: "28083", coverage: "complete", fetchedAt, pagesRead: 1,
    ...normalizeSportmonksSeasonTopScorers(rows, "28083"),
  } };
}
const input = (rows: unknown[], age = 0) => ({ evidence: evidence(rows, age), scope, nowMs: now, maxAgeMs: 1_000 });

test("artilharia ranks every supplied scorer by goals, preserving shared places without provider-position tie breakers", async () => {
  const { resolveTouchlineTopScorersRanking } = await import(moduleUrl.href);
  const ranking = resolveTouchlineTopScorersRanking(input([
    raw(12, 2), raw(10, 5, { position: 99 }), raw(14, 0), raw(13, 3), raw(11, 5, { position: 1 }),
  ]));
  assert.equal(ranking.status, "ready");
  assert.deepEqual(ranking.rows.map(({ providerPlayerId, goals, position }) => ({ providerPlayerId, goals, position })), [
    { providerPlayerId: "10", goals: 5, position: 1 },
    { providerPlayerId: "11", goals: 5, position: 1 },
    { providerPlayerId: "13", goals: 3, position: 3 },
    { providerPlayerId: "12", goals: 2, position: 4 },
    { providerPlayerId: "14", goals: 0, position: 5 },
  ]);
  assert.equal(ranking.publicAwardEligible, false);
  assert.deepEqual(ranking.scope, scope);
});

test("Bota follows exactly the positive first place of this ranking, including leadership changes and shared leads", async () => {
  const { resolveTouchlineTopScorersRanking } = await import(moduleUrl.href);
  for (const rows of [[raw(10, 5), raw(11, 4)], [raw(10, 5), raw(11, 6)], [raw(10, 6), raw(11, 6)]]) {
    const source = input(rows);
    const ranking = resolveTouchlineTopScorersRanking(source);
    const boot = resolveGoldenBootEligibility(source);
    assert.deepEqual(boot.leaders, ranking.rows.filter(row => row.position === 1 && row.goals > 0)
      .map(({ providerPlayerId, providerTeamId, goals }) => ({ providerPlayerId, providerTeamId, goals })));
  }
  assert.deepEqual(resolveGoldenBootEligibility(input([raw(10, 5), raw(11, 6)])).leaders.map(row => row.providerPlayerId), ["11"]);
  assert.equal(resolveGoldenBootEligibility(input([raw(10, 6), raw(11, 6)])).phase, "shared");
});

test("shared second place retains 1/2/2/4 positions and cannot receive the leader's Bota", async () => {
  const { resolveTouchlineTopScorersRanking } = await import(moduleUrl.href);
  const source = input([raw(14, 2), raw(12, 4), raw(10, 5), raw(11, 4)]);
  assert.deepEqual(resolveTouchlineTopScorersRanking(source).rows.map(row => [row.position, row.providerPlayerId]),
    [[1, "10"], [2, "11"], [2, "12"], [4, "14"]]);
  assert.deepEqual(resolveGoldenBootEligibility(source).leaders.map(row => row.providerPlayerId), ["10"]);
});

test("ranking never sums stages or duplicate leaderboard rows and never mutates its input", async () => {
  const { resolveTouchlineTopScorersRanking } = await import(moduleUrl.href);
  const source = input([raw(10, 5), raw(11, 4), raw(10, 5), raw(12, 30, { stage_id: 2 })]);
  const original = structuredClone(source);
  const ranking = resolveTouchlineTopScorersRanking(source);
  assert.deepEqual(ranking.rows.map(row => [row.providerPlayerId, row.goals]), [["10", 5], ["11", 4]]);
  assert.deepEqual(source, original);
  assert.deepEqual(resolveTouchlineTopScorersRanking(input([raw(10, 5), raw(10, 6)])).rows, []);
});

test("empty and zero-goal rankings do not grant a Bota", async () => {
  const { resolveTouchlineTopScorersRanking } = await import(moduleUrl.href);
  for (const rows of [[], [raw(10, 0), raw(11, 0)]]) {
    const source = input(rows);
    const ranking = resolveTouchlineTopScorersRanking(source);
    assert.equal(ranking.status, "ready");
    assert.equal(ranking.rows.length, rows.length);
    assert.equal(resolveGoldenBootEligibility(source).phase, "unavailable");
    assert.deepEqual(resolveGoldenBootEligibility(source).leaders, []);
  }
});

test("stale, incomplete, conflicting or unscoped evidence exposes no partial ranking", async () => {
  const { resolveTouchlineTopScorersRanking } = await import(moduleUrl.href);
  const good = input([raw(10, 5)]);
  assert.ok(good.evidence.ok);
  const candidates = [
    { ...good, scope: null },
    input([raw(10, 5)], 1_001),
    input([raw(10, 5)], -1),
    input([raw(10, 5, { stage_id: undefined })]),
    input([raw(10, 5), raw(11, 4, { season_id: 999 })]),
    input([raw(10, 5), raw(10, 6)]),
    { ...good, evidence: { ...good.evidence, data: { ...good.evidence.data, coverage: "partial" } } },
  ];
  for (const candidate of candidates) {
    const ranking = resolveTouchlineTopScorersRanking(candidate);
    assert.equal(ranking.status, "unavailable");
    assert.deepEqual(ranking.rows, []);
    assert.equal(ranking.publicAwardEligible, false);
  }
});
