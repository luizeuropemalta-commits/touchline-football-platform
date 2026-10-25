import assert from "node:assert/strict";
import test from "node:test";
import { releaseClubCoach, hireClubCoach } from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import { parseClubCoachLifecycleReceipt, parseClubCoachLifecycleResponse } from "../lib/touchlineFantasy/club-coach-lifecycle-response.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

const authority = { expectedAccountId: "11111111-1111-4111-8111-111111111111", expectedSeasonId: "22222222-2222-4222-8222-222222222222" };
const before = (): ClubAcquisitionState => ({ revision: 3, seasonId: authority.expectedSeasonId, plan: "standard", balanceEur: 100_000_000,
  coach: { id: "307", tier: "ruby-red", valueEur: 5_000_000 }, formationCode: "4-3-3",
  players: [{ playerId: "player", clubId: "club", position: "GK", valueEur: 1_000_000, area: "outside", slot: 0 }], receipts: [] });
const release = { action: "release-coach" as const, currentCoachId: "307", expectedRevision: 3, idempotencyKey: "release_coach_1" };
const hire = { action: "hire-coach" as const, incomingCoachId: "455907", expectedRevision: 4, idempotencyKey: "hire_coach_1" };
const context = { marketOpen: true, roundLocked: false };
const offer = { id: "455907", tier: "sapphire-blue" as const, valueEur: 10_000_000, published: true };
function releaseFixture() {
  const original = before();
  return { original, command: release, response: { ok: true as const, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId,
    ...releaseClubCoach(original, release, context), replayed: false } };
}
function hireFixture() {
  const original = releaseClubCoach(before(), release, context).state;
  return { original, command: hire, response: { ok: true as const, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId,
    ...hireClubCoach(original, hire, { ...context, offer }), replayed: false } };
}
const parse = (fixture: ReturnType<typeof releaseFixture> | ReturnType<typeof hireFixture>, response: unknown = fixture.response) =>
  parseClubCoachLifecycleResponse(response, fixture.command, authority, fixture.original);

test("release accepts exact account-scoped snapshot, 10 percent fee and original contract without mutation", () => {
  const f = releaseFixture(), copy = structuredClone(f);
  const result = parse(f);
  assert.ok(result);
  assert.equal(result.state.coach, null);
  assert.equal(result.state.balanceEur, 104_500_000);
  assert.equal(result.receipt.action, "release-coach");
  if (result.receipt.action !== "release-coach") throw Error("wrong action");
  assert.equal(result.receipt.feeCredits, 500_000);
  assert.equal(result.receipt.refundCredits, 4_500_000);
  assert.deepEqual(result.receipt.outgoingContract, f.original.coach);
  assert.notStrictEqual(result.receipt.outgoingContract, f.response.receipt.outgoingContract);
  assert.deepEqual(f, copy);
});

test("hire accepts a genuine vacancy and exact canonical debit with one new revision", () => {
  const f = hireFixture(), copy = structuredClone(f);
  const result = parse(f);
  assert.ok(result);
  assert.equal(result.state.balanceEur, 94_500_000);
  assert.equal(result.state.revision, 5);
  assert.deepEqual(result.state.coach, { id: "455907", tier: "sapphire-blue", valueEur: 10_000_000 });
  assert.deepEqual(result.state.players, f.original.players);
  assert.deepEqual(result.state.receipts, f.original.receipts);
  assert.deepEqual(f, copy);
});

test("receipt schema requires every action field and rejects extras, forged key, ID and revision", () => {
  for (const f of [releaseFixture(), hireFixture()]) {
    for (const key of Object.keys(f.response.receipt)) {
      const missing: Record<string, unknown> = { ...f.response.receipt }; delete missing[key];
      assert.equal(parseClubCoachLifecycleReceipt(missing, f.command), null, key);
    }
    for (const changed of [{ extra: true }, { key: "foreign_key" }, { action: "replace-coach" }, { revision: 9 }, { revision: NaN }, { balanceCredits: -1 }, { balanceCredits: 0.5 }]) {
      assert.equal(parseClubCoachLifecycleReceipt({ ...f.response.receipt, ...changed }, f.command), null);
    }
    assert.equal(parseClubCoachLifecycleReceipt(f.response.receipt, { ...f.command, price: 1 }), null);
  }
  const f = releaseFixture();
  assert.equal(parse(f, { ...f.response, receipt: { ...f.response.receipt, outgoingContract: { ...f.response.receipt.outgoingContract, id: "99" } } }), null);
  const h = hireFixture();
  assert.equal(parse(h, { ...h.response, receipt: { ...h.response.receipt, incomingContract: { ...h.response.receipt.incomingContract, id: "99" } } }), null);
});

test("ordinary 10 percent cannot be replaced by exchange fees or a cheaper invented contract", () => {
  const f = releaseFixture();
  for (const receipt of [
    { ...f.response.receipt, feeCredits: 1_000_000, refundCredits: 4_000_000 },
    { ...f.response.receipt, feeCredits: 0, refundCredits: 5_000_000 },
    { ...f.response.receipt, outgoingContract: { id: "307", tier: "sapphire-blue", valueEur: 10_000_000 }, paidCredits: 10_000_000, feeCredits: 1_000_000, refundCredits: 9_000_000 },
    { ...f.response.receipt, outgoingContract: { id: "307", tier: "ruby-red", valueEur: 1 }, paidCredits: 1 },
  ]) assert.equal(parse(f, { ...f.response, receipt }), null);
  const h = hireFixture();
  assert.equal(parse(h, { ...h.response, receipt: { ...h.response.receipt, signingCredits: 5_000_000 } }), null);
  assert.equal(parse(h, { ...h.response, receipt: { ...h.response.receipt, incomingContract: { ...h.response.receipt.incomingContract, published: true } } }), null);
});

test("response is bound to independently supplied account, season and retained original revision", () => {
  const f = releaseFixture();
  for (const changed of [{ accountId: authority.expectedSeasonId }, { seasonId: authority.expectedAccountId }, { ok: "true" }, { replayed: "true" }, { extra: true }]) {
    assert.equal(parse(f, { ...f.response, ...changed }), null);
  }
  for (const key of Object.keys(f.response)) {
    const missing: Record<string, unknown> = { ...f.response }; delete missing[key]; assert.equal(parse(f, missing), null);
  }
  assert.equal(parseClubCoachLifecycleResponse(f.response, f.command, { ...authority, expectedAccountId: "unverified" }, f.original), null);
  for (const original of [null, {}, { ...f.original, revision: 4 }, { ...f.original, seasonId: authority.expectedAccountId }, { ...f.original, plan: "beta" }, { ...f.original, coach: undefined }]) {
    assert.equal(parseClubCoachLifecycleResponse(f.response, f.command, authority, original), null);
  }
});

test("player contracts, allocation, formation, acquisition receipts and plan cannot change in coach response", () => {
  for (const f of [releaseFixture(), hireFixture()]) {
    for (const changed of [
      { players: [] }, { players: [{ ...f.original.players[0], slot: 1 }] },
      { players: [{ ...f.original.players[0], valueEur: 2_000_000 }] },
      { formationCode: "4-4-2" }, { plan: "vip" },
      { receipts: [{ key: "purchase_x", playerId: "player", area: "outside", slot: 0, valueEur: 1_000_000, revision: 1 }] },
    ]) assert.equal(parse(f, { ...f.response, state: { ...f.response.state, ...changed } }), null);
    const noFormation: Record<string, unknown> = { ...f.response.state }; delete noFormation.formationCode;
    assert.equal(parse(f, { ...f.response, state: noFormation }), null);
  }
});

test("wallet, vacancy and hired contract must match the original snapshot and operation receipt", () => {
  for (const f of [releaseFixture(), hireFixture()]) {
    for (const changed of [{ balanceEur: 1 }, { revision: f.response.state.revision - 1 }, { coach: undefined }]) {
      assert.equal(parse(f, { ...f.response, state: { ...f.response.state, ...changed } }), null);
    }
    assert.equal(parse(f, { ...f.response, receipt: { ...f.response.receipt, balanceCredits: 1 } }), null);
    assert.equal(parseClubCoachLifecycleResponse(f.response, f.command, authority, { ...f.original, balanceEur: 0 }), null);
  }
  const f = releaseFixture();
  assert.equal(parse(f, { ...f.response, state: { ...f.response.state, coach: f.original.coach } }), null);
  assert.equal(parseClubCoachLifecycleResponse(f.response, f.command, authority, { ...f.original, balanceEur: Number.MAX_SAFE_INTEGER }), null);
  const h = hireFixture();
  assert.equal(parse(h, { ...h.response, state: { ...h.response.state, coach: null } }), null);
  assert.equal(parseClubCoachLifecycleResponse(h.response, h.command, authority, { ...h.original, coach: before().coach }), null);
});

test("historical replay with any newer snapshot stays pending, even when wallet happens to match", () => {
  for (const f of [releaseFixture(), hireFixture()]) {
    assert.ok(parse(f, { ...f.response, replayed: true }));
    for (const replayed of [false, true]) {
      assert.equal(parse(f, { ...f.response, replayed, state: { ...f.response.state, revision: f.response.state.revision + 1 } }), null);
    }
    assert.equal(parseClubCoachLifecycleResponse({ ...f.response, replayed: true }, f.command, authority, f.response.state), null);
  }
});

test("JSON property order does not alter preservation and no optimistic transition is computed", () => {
  const f = releaseFixture();
  const player = f.response.state.players[0];
  const reordered = { slot: player.slot, area: player.area, valueEur: player.valueEur, position: player.position, clubId: player.clubId, playerId: player.playerId };
  assert.ok(parse(f, { ...f.response, state: { ...f.response.state, players: [reordered] } }));
  assert.equal(parse(f, { ...f.response, state: null }), null);
  assert.equal(parse(f, { ...f.response, state: { coach: null, balanceEur: 104_500_000 } }), null);
});
