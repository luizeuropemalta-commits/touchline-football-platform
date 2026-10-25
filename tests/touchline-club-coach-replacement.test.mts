import test from "node:test";
import assert from "node:assert/strict";
import { replaceClubCoach, type ClubCoachReplacementCommand, type ClubCoachReplacementContext } from "../lib/touchlineFantasy/club-coach-replacement.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

const state = (): ClubAcquisitionState => ({
  revision: 3, seasonId: "season", plan: "standard", balanceEur: 100_000_000,
  coach: { id: "old", tier: "ruby-red", valueEur: 5_000_000 },
  players: [{ playerId: "player", clubId: "club", position: "GK", valueEur: 10_000_000, area: "outside", slot: 0 }],
  receipts: [], formationCode: "4-3-3",
});
const command: ClubCoachReplacementCommand = { currentCoachId: "old", incomingCoachId: "new", expectedRevision: 3, idempotencyKey: "coach_change_1" };
const context: ClubCoachReplacementContext = { marketOpen: true, roundLocked: false, offer: { id: "new", tier: "sapphire-blue", valueEur: 10_000_000, published: true } };
function rejects(before: ClubAcquisitionState, cmd: ClubCoachReplacementCommand, ctx: ClubCoachReplacementContext, code: string) {
  const copy = structuredClone(before);
  assert.throws(() => replaceClubCoach(before, cmd, ctx), error => error instanceof Error && error.message === code);
  assert.deepEqual(before, copy);
}

test("one atomic proposal applies original signing refund, new price, one coach and one revision", () => {
  const before = state(), copy = structuredClone(before);
  const result = replaceClubCoach(before, command, context);
  assert.deepEqual(before, copy);
  assert.deepEqual(result.receipt, {
    key: "coach_change_1", outgoingCoachId: "old", incomingCoachId: "new", paidCredits: 5_000_000,
    feeCredits: 500_000, refundCredits: 4_500_000, signingCredits: 10_000_000,
    balanceCredits: 94_500_000, revision: 4,
  });
  assert.deepEqual(result.state.coach, { id: "new", tier: "sapphire-blue", valueEur: 10_000_000 });
  assert.strictEqual(result.state.players, before.players);
  assert.strictEqual(result.state.receipts, before.receipts);
  assert.equal(result.state.formationCode, before.formationCode);
  assert.deepEqual(replaceClubCoach(before, command, context), result);
  rejects(result.state, command, context, "CLUB_STALE_REVISION");
});
test("closed or unconfirmed market and locked or unconfirmed round fail closed", () => {
  for (const marketOpen of [false, undefined]) rejects(state(), command, { ...context, marketOpen } as ClubCoachReplacementContext, "CLUB_MARKET_CLOSED");
  for (const roundLocked of [true, undefined]) rejects(state(), command, { ...context, roundLocked } as ClubCoachReplacementContext, "CLUB_COACH_ROUND_LOCKED");
});
test("current and incoming coach identities must be present, owned and different", () => {
  for (const currentCoachId of ["", "foreign"]) rejects(state(), { ...command, currentCoachId }, context, "CLUB_COACH_NOT_OWNED");
  rejects(state(), { ...command, incomingCoachId: " " }, context, "CLUB_COACH_UNAVAILABLE");
  rejects(state(), { ...command, incomingCoachId: "old" }, context, "CLUB_COACH_ALREADY_OWNED");
  rejects({ ...state(), coach: null } as unknown as ClubAcquisitionState, command, context, "CLUB_COACH_INVALID");
  for (const offer of [null, { ...context.offer!, published: false }, { ...context.offer!, id: "foreign" }]) rejects(state(), command, { ...context, offer }, "CLUB_COACH_UNAVAILABLE");
});
test("revision and idempotency key are validated without changing state", () => {
  rejects(state(), { ...command, expectedRevision: 2 }, context, "CLUB_STALE_REVISION");
  for (const expectedRevision of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1]) rejects(state(), { ...command, expectedRevision }, context, "CLUB_REVISION_INVALID");
  rejects({ ...state(), revision: Number.MAX_SAFE_INTEGER }, { ...command, expectedRevision: Number.MAX_SAFE_INTEGER }, context, "CLUB_REVISION_INVALID");
  rejects(state(), { ...command, idempotencyKey: "bad" }, context, "CLUB_IDEMPOTENCY_INVALID");
});
test("integer wallet and canonical incoming price only; exact affordability may leave zero", () => {
  for (const balanceEur of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) rejects({ ...state(), balanceEur }, command, context, "CLUB_BALANCE_INVALID");
  for (const valueEur of [0, 1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) rejects(state(), command, { ...context, offer: { ...context.offer!, valueEur } }, "CLUB_PRICE_INVALID");
  rejects({ ...state(), balanceEur: 5_499_999 }, command, context, "CLUB_INSUFFICIENT_BALANCE");
  assert.equal(replaceClubCoach({ ...state(), balanceEur: 5_500_000 }, command, context).state.balanceEur, 0);
});
test("all paid plans reuse 10 percent ordinary release, not exchange plan fees", () => {
  for (const plan of ["standard", "master", "vip"] as const) {
    const result = replaceClubCoach({ ...state(), plan }, command, context);
    assert.equal(result.receipt.feeCredits, 500_000);
    assert.equal(result.receipt.refundCredits, 4_500_000);
  }
  rejects({ ...state(), plan: "beta" }, command, context, "CLUB_COLLECTION_PAID_PLAN_REQUIRED");
});
test("wallet overflow is rejected, but safe net balance is computed without intermediate overflow", () => {
  const rich = { ...state(), balanceEur: Number.MAX_SAFE_INTEGER, coach: { id: "old", tier: "diamond-gold" as const, valueEur: 70_000_000 } };
  rejects(rich, command, context, "CLUB_CREDITS_OVERFLOW");
  const expensive = { ...context, offer: { id: "new", tier: "diamond-gold" as const, valueEur: 70_000_000, published: true } };
  assert.equal(replaceClubCoach(rich, command, expensive).state.balanceEur, Number.MAX_SAFE_INTEGER - 7_000_000);
});
