import assert from "node:assert/strict";
import test from "node:test";
import { resolveGoldenBootPremierStageScope } from "../lib/touchlineArena/golden-boot-stage-scope.ts";
import { resolveGoldenBootEligibility } from "../lib/touchlineArena/golden-boot-eligibility.ts";
import type { FootballDataResult, TouchlineSeasonStages, TouchlineSeasonTopScorers } from "../lib/football-data/types.ts";

const nowMs = Date.parse("2026-10-01T12:00:00.000Z");
const maxAgeMs = 60_000;
const canonicalScope = { leagueId: "8", seasonId: "70001" };
type Success = Extract<FootballDataResult<TouchlineSeasonStages>, { ok: true }>;
function evidence(age = 0): Success {
  const fetchedAt = new Date(nowMs - age).toISOString();
  return { ok: true, provider: "sportmonks", cached: false, fetchedAt, data: {
    coverage: "complete", leagueId: "8", requestedSeasonId: "70001", fetchedAt,
    rows: [{ id: "90001", leagueId: "8", seasonId: "70001", typeId: "223" }],
  } };
}
function resolve(value: unknown = evidence()) {
  return resolveGoldenBootPremierStageScope({
    evidence: value as FootballDataResult<TouchlineSeasonStages> | null,
    canonicalScope, maxAgeMs, nowMs,
  });
}
type Raw = { ok: unknown; provider: unknown; fetchedAt: unknown; data: Record<string, unknown> };
const stage = (value: Raw) => (value.data.rows as Array<Record<string, unknown>>)[0]!;

test("one complete independent Premier League Regular Season resolves without a season/stage allowlist", () => {
  const original = evidence();
  const before = JSON.stringify(original);
  assert.deepEqual(resolve(original), {
    authority: "canonical-season-stage", leagueId: "8", seasonId: "70001", stageId: "90001",
  });
  assert.equal(JSON.stringify(original), before, "Do not mutate the provider evidence");
  const other = evidence();
  const source: Success = { ...other, data: {
    ...other.data, requestedSeasonId: "80002",
    rows: [{ id: "91002", leagueId: "8", seasonId: "80002", typeId: "223" }],
  } };
  assert.deepEqual(resolveGoldenBootPremierStageScope({
    evidence: source, canonicalScope: { leagueId: "8", seasonId: "80002" }, nowMs, maxAgeMs,
  }), { authority: "canonical-season-stage", leagueId: "8", seasonId: "80002", stageId: "91002" });
});

const invalid: Array<[string, (value: Raw) => void]> = [
  ["provider", value => { value.provider = "another-provider"; }],
  ["success flag", value => { value.ok = "true"; }],
  ["partial list", value => { value.data.coverage = "partial"; }],
  ["missing coverage", value => { delete value.data.coverage; }],
  ["missing list", value => { delete value.data.rows; }],
  ["non-array list", value => { value.data.rows = {}; }],
  ["empty list", value => { value.data.rows = []; }],
  ["two Regular Seasons", value => { value.data.rows = [stage(value), { ...stage(value), id: "90002" }]; }],
  ["one Regular Season plus another stage", value => { value.data.rows = [stage(value), { ...stage(value), id: "90002", typeId: "224" }]; }],
  ["duplicate stage rows", value => { value.data.rows = [stage(value), stage(value)]; }],
  ["wrong type", value => { stage(value).typeId = "224"; }],
  ["numeric type bypassing normalization", value => { stage(value).typeId = 223; }],
  ["missing type despite plausible name", value => { delete stage(value).typeId; stage(value).name = "Regular Season"; }],
  ["data league mismatch", value => { value.data.leagueId = "9"; }],
  ["data season mismatch", value => { value.data.requestedSeasonId = "70002"; }],
  ["stage league mismatch", value => { stage(value).leagueId = "9"; }],
  ["stage season mismatch", value => { stage(value).seasonId = "70002"; }],
  ["missing stage league", value => { delete stage(value).leagueId; }],
  ["missing stage season", value => { delete stage(value).seasonId; }],
  ["null stage", value => { value.data.rows = [null]; }],
  ["array stage", value => { value.data.rows = [[]]; }],
  ["invalid outer time", value => { value.fetchedAt = "invalid"; }],
  ["invalid inner time", value => { value.data.fetchedAt = "invalid"; }],
  ["numeric timestamp", value => { value.data.fetchedAt = nowMs; }],
  ["calendar-normalized impossible date", value => { value.fetchedAt = value.data.fetchedAt = "2026-02-30T12:00:00.000Z"; }],
  ["non-ISO time", value => { value.fetchedAt = value.data.fetchedAt = "2026-10-01"; }],
  ["mismatched valid timestamps", value => { value.fetchedAt = new Date(nowMs - 1).toISOString(); }],
];
for (const badId of [undefined, null, 90001, 0, "", "0", "-1", "01", "1.5", "1e3", " 90001", "90001 ", "player:90001"]) {
  invalid.push(["invalid stage ID " + String(badId), value => { stage(value).id = badId; }]);
}
for (const [label, mutate] of invalid) {
  test("stage scope fails closed: " + label, () => {
    const value = structuredClone(evidence()) as unknown as Raw;
    mutate(value);
    assert.equal(resolve(value), null);
  });
}

test("absent/failed evidence cannot authorize a stage", () => {
  for (const value of [null, undefined, { ok: false, provider: "sportmonks", fetchedAt: evidence().fetchedAt,
    error: { code: "provider_error", provider: "sportmonks", message: "Synthetic failure" } },
    { ...evidence(), data: null }]) {
    // Pass undefined directly: resolve() uses a positive default fixture.
    assert.equal(resolveGoldenBootPremierStageScope({
      evidence: value as FootballDataResult<TouchlineSeasonStages> | null,
      canonicalScope, nowMs, maxAgeMs,
    }), null);
  }
});

test("canonical authority and explicit clock/freshness policy are mandatory", () => {
  for (const scope of [null, { leagueId: "9", seasonId: "70001" }, { leagueId: "08", seasonId: "70001" },
    { leagueId: "8", seasonId: "" }, { leagueId: "8", seasonId: "070001" }, { leagueId: "8", seasonId: "70001 " }]) {
    assert.equal(resolveGoldenBootPremierStageScope({ evidence: evidence(), canonicalScope: scope, nowMs, maxAgeMs }), null);
  }
  for (const age of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(resolveGoldenBootPremierStageScope({ evidence: evidence(), canonicalScope, nowMs, maxAgeMs: age }), null);
  }
  for (const now of [-1, NaN, Infinity, nowMs + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(resolveGoldenBootPremierStageScope({ evidence: evidence(), canonicalScope, nowMs: now, maxAgeMs }), null);
  }
});

test("cached evidence keeps its actual fetch age; expiry and future evidence revoke the scope", () => {
  assert.ok(resolve(evidence(maxAgeMs)));
  assert.equal(resolve(evidence(maxAgeMs + 1)), null);
  assert.equal(resolve(evidence(-1)), null);
  assert.deepEqual(resolve({ ...evidence(1), cached: true }), resolve(evidence(1)));
  assert.equal(resolve({ ...evidence(maxAgeMs + 1), cached: true }), null);
  const equivalent = evidence();
  assert.ok(resolve({ ...equivalent, fetchedAt: equivalent.fetchedAt.replace(".000Z", "Z") }));
});

test("resolved stage can scope all tied leaders but never enables a public award", () => {
  const scope = resolve();
  assert.ok(scope);
  const fetchedAt = evidence().fetchedAt;
  const topScorers: FootballDataResult<TouchlineSeasonTopScorers> = {
    ok: true, provider: "sportmonks", fetchedAt, data: {
      requestedSeasonId: "70001", coverage: "complete", scopeStatus: "complete", reason: null,
      pagesRead: 1, fetchedAt, rows: ["21", "22"].map((id) => ({
        providerRecordId: id, providerPlayerId: id, providerTeamId: "19",
        leagueId: "8", seasonId: "70001", stageId: "90001", goals: 3,
      })),
    },
  };
  const result = resolveGoldenBootEligibility({ evidence: topScorers, scope, maxAgeMs, nowMs });
  assert.equal(result.phase, "shared");
  assert.deepEqual(result.leaders.map(leader => leader.providerPlayerId), ["21", "22"]);
  assert.equal(result.publicAwardEligible, false);
  assert.equal(result.freshnessAuthority, "fetch-age-only");
  assert.equal(resolveGoldenBootEligibility({ evidence: topScorers, scope: resolve(evidence(maxAgeMs + 1)), maxAgeMs, nowMs }).publicAwardEligible, false);
});
