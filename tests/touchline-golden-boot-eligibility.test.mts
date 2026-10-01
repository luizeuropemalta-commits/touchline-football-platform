import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSportmonksSeasonTopScorers } from "../lib/football-data/sportmonks-season-topscorers.ts";
import type { FootballDataResult, TouchlineSeasonTopScorers } from "../lib/football-data/types.ts";

const moduleUrl = new URL("../lib/touchlineArena/golden-boot-eligibility.ts", import.meta.url);
const now = Date.parse("2026-10-01T12:00:00Z");
const scope = { authority: "canonical-season-stage" as const, leagueId: "8", seasonId: "28083", stageId: "1" };
const raw = (player: number, goals: number, extra = {}) => ({ id: player, player_id: player, participant_id: 9, league_id: 8, season_id: 28083, stage_id: 1, type_id: 208, total: goals, ...extra });
function evidence(rows: unknown[], age = 0): FootballDataResult<TouchlineSeasonTopScorers> {
  const fetchedAt = new Date(now - age).toISOString();
  return { ok: true, provider: "sportmonks", cached: false, fetchedAt, data: {
    requestedSeasonId: "28083", coverage: "complete", fetchedAt, pagesRead: 1,
    ...normalizeSportmonksSeasonTopScorers(rows, "28083"),
  } };
}

test("Golden Boot resolver preserves all ties, revokes stale evidence and never authorizes a public card", async () => {
  const { resolveGoldenBootEligibility } = await import(moduleUrl.href);
  const read = (source: FootballDataResult<TouchlineSeasonTopScorers>) => resolveGoldenBootEligibility({ evidence: source, scope, nowMs: now, maxAgeMs: 1_000 });
  const unique = read(evidence([raw(10, 3), raw(11, 2)]));
  assert.equal(unique.phase, "unique");
  assert.deepEqual(unique.leaders.map((leader: { providerPlayerId: string }) => leader.providerPlayerId), ["10"]);
  assert.equal(unique.publicAwardEligible, false);
  const shared = read(evidence([raw(12, 3, { position: 1 }), raw(10, 3, { position: 99 }), raw(11, 2)]));
  assert.equal(shared.phase, "shared");
  assert.deepEqual(shared.leaders.map((leader: { providerPlayerId: string }) => leader.providerPlayerId), ["10", "12"]);
  assert.equal(read(evidence([raw(10, 3)], 1_001)).phase, "unavailable");
  assert.deepEqual(read(evidence([raw(10, 3)], 1_001)).leaders, []);
  assert.equal(read(evidence([raw(10, 0), raw(11, 0)])).phase, "unavailable");
  assert.equal(read(evidence([])).phase, "unavailable");
});

test("Golden Boot needs external stage authority and never sums stages or invents absent scope", async () => {
  const { resolveGoldenBootEligibility } = await import(moduleUrl.href);
  const source = evidence([raw(10, 3), raw(11, 20, { stage_id: 2 })]);
  const base = { evidence: source, scope, maxAgeMs: 1_000, nowMs: now };
  assert.equal(resolveGoldenBootEligibility({ ...base, scope: null }).phase, "unavailable");
  assert.equal(resolveGoldenBootEligibility({ ...base, scope: { ...scope, authority: "request" } }).phase, "unavailable");
  assert.equal(resolveGoldenBootEligibility({ ...base, scope: { ...scope, leagueId: "9" } }).phase, "unavailable");
  assert.equal(resolveGoldenBootEligibility({ ...base, scope: { ...scope, seasonId: "9" } }).phase, "unavailable");
  assert.equal(resolveGoldenBootEligibility({ ...base, scope: { ...scope, stageId: "3" } }).phase, "unavailable");
  const stage = resolveGoldenBootEligibility(base);
  assert.deepEqual(stage.leaders, [{ providerPlayerId: "10", providerTeamId: "9", goals: 3 }]);
  assert.equal(stage.scope.stageId, "1");
  assert.equal(stage.freshnessAuthority, "fetch-age-only");
});

test("failures, malformed coverage, conflicting duplicates, future timestamps and missing facts revoke leadership", async () => {
  const { resolveGoldenBootEligibility } = await import(moduleUrl.href);
  const good = evidence([raw(10, 3)]);
  assert.ok(good.ok);
  const candidates = [
    null,
    { ok: false, provider: "sportmonks", fetchedAt: good.fetchedAt, error: { code: "rate_limited" } },
    { ...good, data: { ...good.data, coverage: "partial" } },
    { ...good, data: { ...good.data, pagesRead: 0 } },
    { ...good, fetchedAt: new Date(now + 1).toISOString() },
    evidence([raw(10, 3)], -1),
    evidence([raw(10, 3, { stage_id: undefined })]),
    evidence([raw(10, 3), raw(10, 4)]),
    { ...good, data: { ...good.data, rows: [...good.data.rows, { ...good.data.rows[0], goals: 4 }] } },
  ];
  for (const candidate of candidates) {
    const result = resolveGoldenBootEligibility({ evidence: candidate, scope, maxAgeMs: 1_000, nowMs: now });
    assert.equal(result.phase, "unavailable");
    assert.deepEqual(result.leaders, []);
  }
  for (const maxAgeMs of [0, -1, NaN, Infinity]) {
    assert.equal(resolveGoldenBootEligibility({ evidence: good, scope, maxAgeMs, nowMs: now }).phase, "unavailable");
  }
  assert.equal(resolveGoldenBootEligibility({ evidence: evidence([raw(10, 3)], 1_000), scope, maxAgeMs: 1_000, nowMs: now }).phase, "unique");
});
