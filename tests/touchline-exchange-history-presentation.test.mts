import assert from "node:assert/strict";
import test from "node:test";
import { projectExchangeHistory, type ExchangeHistorySnapshot } from "../lib/touchlineFantasy/exchange-history-presentation.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { ready: true, accountId: id(1), seasonId: id(2), collectionRevision: 7 };
const snapshot = (): ExchangeHistorySnapshot => ({ version: 1, status: "confirmed", accountId: id(1), seasonId: id(2), collectionRevision: 7,
  coverage: "complete", seasonNegotiationIncomeTc: 0,
  receipts: [{ id: id(3), occurredAt: "2026-10-25T14:00:00.123456Z", counterpart: { accountId: id(4), name: "Synthetic counterpart" },
    proposer: { accountId: id(1), name: "Synthetic proposer" }, given: { playerId: id(5), name: "Synthetic former name", valueTc: 10_000_000 },
    received: { playerId: id(6), name: "Synthetic received name", valueTc: 20_000_000 },
    difference: { direction: "paid", amountTc: 10_000_000 }, feeTc: 500_000, bonusTc: 0, balanceAfterTc: 30_000_000 }],
});
test("presentation copies confirmed scoped receipt facts without recalculating trade policy or wallet", () => {
  const value = snapshot(), before = structuredClone(value);
  const result = projectExchangeHistory(value, scope);
  assert.deepEqual(result, before); assert.notEqual(result, value); assert.notEqual(result?.receipts[0], value.receipts[0]);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result?.receipts[0].difference));
  assert.deepEqual(value, before);
  // Deliberately not the research 7/5/4/2 schedule: presentation must not apply a rate.
  assert.equal(result?.receipts[0].feeTc, 500_000);
  assert.equal(result?.receipts[0].balanceAfterTc, 30_000_000);
});
test("missing, unconfirmed, cross-account/season/revision data never becomes an empty or zero ledger", () => {
  for (const value of [undefined, null, {}, [], { ...snapshot(), status: "pending" }, { ...snapshot(), version: 2 },
    { ...snapshot(), accountId: id(7) }, { ...snapshot(), seasonId: id(7) }, { ...snapshot(), collectionRevision: 6 },
    { ...snapshot(), coverage: { toString: () => "complete" } }]) assert.equal(projectExchangeHistory(value, scope), null);
  for (const patch of [{ ready: false }, { accountId: undefined }, { accountId: "invalid" }, { seasonId: undefined }, { collectionRevision: NaN }]) {
    assert.equal(projectExchangeHistory(snapshot(), { ...scope, ...patch }), null);
  }
});
test("malformed and duplicate receipts reject the entire projection without quietly dropping rows", () => {
  const value = snapshot(), row = value.receipts[0];
  for (const patch of [{ id: "bad" }, { occurredAt: "2026-02-30T14:00:00Z" }, { occurredAt: "2026-10-25" },
    { counterpart: { accountId: id(1), name: "Same account" } }, { proposer: { accountId: id(9), name: "Third party" } },
    { given: { ...row.given, name: " " } }, { received: row.given }, { feeTc: -1 }, { bonusTc: Number.MAX_SAFE_INTEGER + 1 },
    { balanceAfterTc: null }, { difference: { direction: "none", amountTc: 1 } }, { difference: { direction: "paid", amountTc: 0 } },
    { difference: { direction: { toString: () => "paid" }, amountTc: 1 } }]) {
    assert.equal(projectExchangeHistory({ ...value, receipts: [row, { ...row, id: id(8), ...patch }] }, scope), null);
  }
  assert.equal(projectExchangeHistory({ ...value, receipts: [row, row] }, scope), null);
});
test("partial histories keep independent season income; unavailable income stays null, explicit empty stays explicit", () => {
  const partial = projectExchangeHistory({ ...snapshot(), coverage: "partial", seasonNegotiationIncomeTc: 900_000 }, scope);
  assert.equal(partial?.seasonNegotiationIncomeTc, 900_000, "do not sum the displayed page's bonus");
  assert.equal(projectExchangeHistory({ ...snapshot(), seasonNegotiationIncomeTc: null }, scope)?.seasonNegotiationIncomeTc, null);
  const empty = projectExchangeHistory({ ...snapshot(), receipts: [], seasonNegotiationIncomeTc: 0 }, scope);
  assert.deepEqual(empty?.receipts, []); assert.equal(empty?.seasonNegotiationIncomeTc, 0);
});
test("sorting is deterministic, public projection drops private extras, input order remains intact", () => {
  const value = snapshot(), row = value.receipts[0];
  const input = { ...value, privateSecret: "NEVER_RENDER", receipts: [row, { ...row, id: id(8), occurredAt: "2026-10-25T15:00:00Z", privateSecret: "NEVER_RENDER" }] };
  const result = projectExchangeHistory(input, scope)!;
  assert.equal(result.receipts[0].id, id(8)); assert.equal(input.receipts[0].id, id(3));
  assert.ok(!JSON.stringify(result).includes("NEVER_RENDER"));
});
