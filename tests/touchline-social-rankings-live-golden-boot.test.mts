import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { deriveRankingsLive } from "../lib/social-rankings-live-contract.ts";
import { applyRankingsGoldenBootEvidence } from "../lib/social-rankings-live-golden-boot.ts";
const read = (name: string) => JSON.parse(readFileSync(new URL(`../artifacts/social-studio/rankings/${name}`, import.meta.url), "utf8"));
const source = read("snapshot-20260914.json"), facts = read("settlement-evidence-20260914.json");
facts.ratingFeeds = read("rating-lineup-evidence-20260914.json").feeds;
const base = deriveRankingsLive(source, facts, facts.publishedPlayerIds, "test");
const evidence = read("golden-boot-reconciliation-20260914.json");
const hash = (e: typeof evidence) => { e.method.feedEvidenceSha256 = createHash("sha256").update(JSON.stringify(e.fixtureEvidence)).digest("hex"); return e; };
test("latest final feeds produce Haaland4, preserve gates and include no stale goals", () => {
  const result = applyRankingsGoldenBootEvidence(base, source, evidence);
  assert.equal(result.goldenBoot.state, "FACTUAL_REVIEW");
  assert.equal(result.goldenBoot.candidates[0]!.name, "Erling Haaland");
  assert.equal(result.goldenBoot.candidates[0]!.goals, 4);
  assert.equal(result.publishable, false);
  assert.equal(result.outbound, "DISABLED");
  assert.ok(result.gates.includes("ACTIVE_PLAYER_SNAPSHOT_REQUIRES_RECONCILIATION"));
});
test("missing final fixture, tampering and altered score progressions fail closed", () => {
  const missing = structuredClone(evidence); missing.fixtureEvidence.shift();
  assert.throws(() => applyRankingsGoldenBootEvidence(base, source, hash(missing)), /COVERAGE_MISMATCH/);
  const altered = structuredClone(evidence); altered.fixtureEvidence[0].goal_var_events[0].result = "2-0";
  assert.throws(() => applyRankingsGoldenBootEvidence(base, source, altered), /HASH_MISMATCH/);
  assert.throws(() => applyRankingsGoldenBootEvidence(base, source, hash(altered)), /PROGRESSION_MISMATCH/);
});
test("an unrelated leader UUID or wrong official aggregate cannot authorize the card", () => {
  const wrong = structuredClone(evidence); wrong.verdict.leader.playerId = base.overall.playerId;
  assert.throws(() => applyRankingsGoldenBootEvidence(base, source, wrong), /IDENTITY_MISMATCH/);
  const totals = structuredClone(evidence); totals.officialAggregateEvidence.players[0].goals_scored++;
  assert.throws(() => applyRankingsGoldenBootEvidence(base, source, totals), /AGGREGATE_MISMATCH/);
});
