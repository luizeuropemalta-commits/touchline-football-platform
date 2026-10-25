import assert from "node:assert/strict";
import test from "node:test";
import { hireClubCoach, inspectClubCoachLifecycle, parseClubCoachLifecycleCommand, releaseClubCoach,
  type ClubCoachLifecycleState, type ClubCoachLifecycleContext } from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import { inspectClubAcquisition } from "../lib/touchlineFantasy/club-acquisition.ts";

const state = () => ({ revision: 3, seasonId: "season", plan: "standard" as const, balanceEur: 100_000_000,
  coach: { id: "307", tier: "ruby-red" as const, valueEur: 5_000_000 },
  players: [], receipts: [], formationCode: "4-3-3" });
const release = { action: "release-coach" as const, currentCoachId: "307", expectedRevision: 3, idempotencyKey: "release_coach_1" };
const hire = { action: "hire-coach" as const, incomingCoachId: "455907", expectedRevision: 4, idempotencyKey: "hire_coach_1" };
const context = { marketOpen: true, roundLocked: false };
const offer = { id: "455907", tier: "sapphire-blue" as const, valueEur: 10_000_000, published: true };
const error = (code: string) => (caught: unknown) => caught instanceof Error && caught.message === code;

test("separate release and hire preserve players while using two revisions and two receipts", () => {
  const before = state(), copy = structuredClone(before);
  const released = releaseClubCoach(before, release, context);
  assert.deepEqual(before, copy);
  assert.equal(released.state.coach, null);
  assert.equal(released.state.balanceEur, 104_500_000);
  assert.equal(released.receipt.feeCredits, 500_000);
  assert.equal(released.receipt.refundCredits, 4_500_000);
  assert.deepEqual(released.receipt.outgoingContract, before.coach);
  assert.notStrictEqual(released.receipt.outgoingContract, before.coach);
  assert.equal(released.state.revision, 4);
  const hired = hireClubCoach(released.state, hire, { ...context, offer });
  assert.equal(released.state.coach, null);
  assert.deepEqual(hired.state.coach, { id: offer.id, tier: offer.tier, valueEur: offer.valueEur });
  assert.equal(hired.state.balanceEur, 94_500_000);
  assert.equal(hired.state.revision, 5);
  assert.equal(hired.receipt.signingCredits, 10_000_000);
  assert.strictEqual(hired.state.players, before.players);
  assert.strictEqual(hired.state.receipts, before.receipts);
  assert.equal(hired.state.formationCode, before.formationCode);
  assert.notEqual(hired.receipt.key, released.receipt.key);
});

test("paid vacancy validates locally without permitting repeated release or Beta vacancy", () => {
  const vacant = releaseClubCoach(state(), release, context).state;
  const before = structuredClone(vacant);
  assert.doesNotThrow(() => inspectClubCoachLifecycle(vacant));
  assert.doesNotThrow(() => inspectClubAcquisition(vacant));
  assert.deepEqual(vacant, before);
  assert.throws(() => inspectClubAcquisition({ ...vacant, plan: "beta" }), error("CLUB_BETA_COACH_REQUIRED"));
  assert.throws(() => releaseClubCoach(vacant, { ...release, expectedRevision: 4 }, context), error("CLUB_COACH_REQUIRED"));
  assert.throws(() => hireClubCoach(state(), { ...hire, expectedRevision: 3 }, { ...context, offer }), error("CLUB_COACH_ALREADY_OWNED"));
});

test("ordinary release uses 10 percent for every paid plan and never exchange percentages", () => {
  for (const plan of ["standard", "master", "vip"] as const) {
    const result = releaseClubCoach({ ...state(), plan }, release, context);
    assert.equal(result.receipt.feeCredits, 500_000);
    assert.equal(result.receipt.refundCredits, 4_500_000);
  }
  assert.throws(() => releaseClubCoach({ ...state(), plan: "beta" }, release, context), error("CLUB_COLLECTION_PAID_PLAN_REQUIRED"));
});

test("commands allow only numeric coach identities, revision and idempotency reference", () => {
  assert.deepEqual(parseClubCoachLifecycleCommand(release), release);
  assert.deepEqual(parseClubCoachLifecycleCommand(hire), hire);
  for (const extra of [{ balanceEur: 1 }, { ownerId: "other" }, { price: 1 }, { published: true }, { marketOpen: true }]) {
    assert.equal(parseClubCoachLifecycleCommand({ ...release, ...extra }), null);
  }
  for (const currentCoachId of ["", "sportmonks:307", "name", 307, "12345678901234567"]) assert.equal(parseClubCoachLifecycleCommand({ ...release, currentCoachId }), null);
  for (const expectedRevision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.equal(parseClubCoachLifecycleCommand({ ...hire, expectedRevision }), null);
  for (const idempotencyKey of ["", "short", "x".repeat(121)]) assert.equal(parseClubCoachLifecycleCommand({ ...hire, idempotencyKey }), null);
});

test("both operations recheck market and round instead of using release-time permission", () => {
  const vacant = releaseClubCoach(state(), release, context).state;
  for (const marketOpen of [false, undefined]) {
    const closed = { ...context, marketOpen } as ClubCoachLifecycleContext;
    assert.throws(() => releaseClubCoach(state(), release, closed), error("CLUB_MARKET_CLOSED"));
    assert.throws(() => hireClubCoach(vacant, hire, { ...closed, offer }), error("CLUB_MARKET_CLOSED"));
  }
  for (const roundLocked of [true, undefined]) {
    const locked = { ...context, roundLocked } as ClubCoachLifecycleContext;
    assert.throws(() => releaseClubCoach(state(), release, locked), error("CLUB_COACH_ROUND_LOCKED"));
    assert.throws(() => hireClubCoach(vacant, hire, { ...locked, offer }), error("CLUB_COACH_ROUND_LOCKED"));
  }
});

test("foreign ownership and stale retries do not duplicate refunds or signings", () => {
  assert.throws(() => releaseClubCoach(state(), { ...release, currentCoachId: "455907" }, context), error("CLUB_COACH_NOT_OWNED"));
  const vacant = releaseClubCoach(state(), release, context).state;
  assert.throws(() => releaseClubCoach(vacant, release, context), error("CLUB_STALE_REVISION"));
  const hired = hireClubCoach(vacant, hire, { ...context, offer }).state;
  assert.throws(() => hireClubCoach(hired, hire, { ...context, offer }), error("CLUB_STALE_REVISION"));
});

test("hire requires a matching published canonical-price offer and exact affordability", () => {
  const vacant = releaseClubCoach(state(), release, context).state;
  for (const unavailable of [null, { ...offer, published: false }, { ...offer, id: "515" }]) assert.throws(
    () => hireClubCoach(vacant, hire, { ...context, offer: unavailable }), error("CLUB_COACH_UNAVAILABLE"));
  for (const valueEur of [0, 1, 1.5, NaN, Infinity]) assert.throws(
    () => hireClubCoach(vacant, hire, { ...context, offer: { ...offer, valueEur } }), error("CLUB_PRICE_INVALID"));
  assert.throws(() => hireClubCoach({ ...vacant, balanceEur: 9_999_999 }, hire, { ...context, offer }), error("CLUB_INSUFFICIENT_BALANCE"));
  assert.equal(hireClubCoach({ ...vacant, balanceEur: 10_000_000 }, hire, { ...context, offer }).state.balanceEur, 0);
});

test("invalid envelope and overflowing independent release fail without mutation", () => {
  const rich = { ...state(), balanceEur: Number.MAX_SAFE_INTEGER }, copy = structuredClone(rich);
  assert.throws(() => releaseClubCoach(rich, release, context), error("CLUB_CREDITS_OVERFLOW"));
  assert.deepEqual(rich, copy);
  for (const balanceEur of [-1, 0.5, NaN, Infinity]) assert.throws(
    () => releaseClubCoach({ ...state(), balanceEur }, release, context), error("CLUB_BALANCE_INVALID"));
  assert.throws(() => inspectClubCoachLifecycle({ ...state(), coach: undefined } as unknown as ClubCoachLifecycleState), error("CLUB_COACH_INVALID"));
});
