import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCoachReconciliation, parseCoachRankingDiagnostic } from "../lib/football-data/coach-reconciliation-diagnostic.ts";
const receipt = (reason: unknown = "coach-editorial-identity-pending", ids: unknown = ["99991"]) => ({ ok: false, reconciled: 0, pending: [], ranking: { ok: false, reason, pendingCoachIds: ids } });
test("editorial identity reason survives independently from empty fixture pending list", () => {
  assert.deepEqual(summarizeCoachReconciliation(receipt()), { version: 1, reason: "coach-editorial-identity-pending", pendingCoachCount: 1, pendingFixtureCount: 0 });
});
test("known ranking reasons stay distinct and never carry source IDs", () => {
  for (const reason of ["season-unavailable", "fixture-attribution-pending", "coach-editorial-identity-pending", "fixture-results-unavailable"]) {
    const diagnostic = summarizeCoachReconciliation(receipt(reason));
    assert.equal(diagnostic?.reason, reason); assert.ok(!JSON.stringify(diagnostic).includes("99991"));
  }
});
test("old generic receipts and unknown provider text never become an invented editorial cause", () => {
  assert.equal(summarizeCoachReconciliation({ ok: false, reconciled: 0, pending: [] })?.reason, "ranking-unconfirmed");
  assert.equal(summarizeCoachReconciliation(receipt("private@example.invalid token=secret"))?.reason, "ranking-unconfirmed");
});
test("ambiguous transport ignores any otherwise useful payload", () => {
  assert.equal(summarizeCoachReconciliation(receipt(), { code: "PRIVATE" })?.reason, "reconciliation-unconfirmed");
  assert.equal(summarizeCoachReconciliation(null)?.reason, "reconciliation-unconfirmed");
  assert.equal(summarizeCoachReconciliation({ ok: false, reconciled: -1 })?.reason, "reconciliation-unconfirmed");
});
test("malformed or contradictory status cannot confirm a cause or successful reconciliation", () => {
  for (const value of [
    { ...receipt(), ok: undefined }, { ...receipt(), ok: "false" },
    { ...receipt(), ok: true },
    { ...receipt(), ranking: { ok: true } },
    { ...receipt(), ranking: { ok: "false", reason: "coach-editorial-identity-pending" } },
    { ok: true, reconciled: 2 },
  ]) {
    assert.deepEqual(summarizeCoachReconciliation(value), {
      version: 1, reason: "reconciliation-unconfirmed", pendingCoachCount: null, pendingFixtureCount: null,
    });
  }
});
test("counts are bounded, distinct and reject malformed identities", () => {
  assert.equal(summarizeCoachReconciliation(receipt(undefined, ["99991", "99991"]))?.pendingCoachCount, 1);
  for (const value of [["x"], ["99991", "private@example.invalid"], new Array(501).fill("99991"), "99991"]) {
    assert.equal(summarizeCoachReconciliation(receipt(undefined, value))?.pendingCoachCount, null);
  }
});
test("stored summary parser strips extra data and rejects corrupt counters", () => {
  const base = summarizeCoachReconciliation(receipt())!;
  assert.deepEqual(parseCoachRankingDiagnostic({ ...base, pendingCoachIds: ["99991"], email: "private@example.invalid" }), base);
  for (const value of [null, {}, {...base, version: 2}, {...base, pendingCoachCount: -1}, {...base, pendingFixtureCount: 501}, {...base, reason: "private"}]) assert.equal(parseCoachRankingDiagnostic(value), null);
});
test("confirmed success produces no pending diagnostic", () => {
  assert.equal(summarizeCoachReconciliation({ok:true,reconciled:2,ranking:{ok:true},pending:[]}),null);
});
