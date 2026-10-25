import assert from "node:assert/strict";
import test from "node:test";
import { decideClubCoachRecovery, type ClubCoachRecoveryCurrent, type ClubCoachRecoveryPending } from "../lib/touchlineFantasy/club-coach-recovery-decision.ts";
import { releaseClubCoach, hireClubCoach } from "../lib/touchlineFantasy/club-coach-lifecycle.ts";
import type { ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";

const authority = { expectedAccountId: "11111111-1111-4111-8111-111111111111", expectedSeasonId: "22222222-2222-4222-8222-222222222222" };
const release = { action: "release-coach" as const, currentCoachId: "307", expectedRevision: 3, idempotencyKey: "coach_release_01" };
const hire = { action: "hire-coach" as const, incomingCoachId: "455907", expectedRevision: 4, idempotencyKey: "coach_hire_01" };
const context = { marketOpen: true, roundLocked: false };
function fixture(action: "release" | "hire" = "release") {
  const original: ClubAcquisitionState = { revision: 3, seasonId: authority.expectedSeasonId, plan: "standard", balanceEur: 100_000_000,
    coach: { id: "307", tier: "ruby-red", valueEur: 5_000_000 }, formationCode: "4-3-3",
    players: [{ playerId: "player", clubId: "club", position: "GK", valueEur: 1_000_000, area: "outside", slot: 0 }], receipts: [] };
  const released = releaseClubCoach(original, release, context);
  const before = action === "release" ? original : released.state;
  const transition = action === "release" ? released : hireClubCoach(released.state, hire, {
    ...context, offer: { id: "455907", tier: "sapphire-blue", valueEur: 10_000_000, published: true },
  });
  const command = action === "release" ? release : hire;
  const retained: ClubCoachRecoveryPending = { authority, generation: 7, command, before };
  const current: ClubCoachRecoveryCurrent = { authority, generation: 7, command, confirmedState: structuredClone(before) };
  const recovery = { status: "committed", resolved: true, operationRevision: transition.receipt.revision,
    response: { ok: true, accountId: authority.expectedAccountId, seasonId: authority.expectedSeasonId, ...transition, replayed: true } };
  return { retained, current, recovery };
}

test("release and hire recover the exact response from the original confirmed snapshot", () => {
  for (const action of ["release", "hire"] as const) {
    const f = fixture(action), original = structuredClone(f);
    const result = decideClubCoachRecovery(f.retained, f.current, f.recovery);
    assert.equal(result.status, "confirmed");
    if (result.status !== "confirmed") throw Error("not confirmed");
    assert.equal(result.snapshot.action, "replace");
    if (result.snapshot.action !== "replace") throw Error("not replaced");
    assert.equal(result.snapshot.state, f.recovery.response.state, "use validated server snapshot, not local arithmetic");
    assert.deepEqual(result.receipt, f.recovery.response.receipt);
    assert.deepEqual(f, original, "decision leaves every input unchanged");
  }
});

test("historical receipt confirms without returning a replacement for a newer collection", () => {
  for (const action of ["release", "hire"] as const) {
    const f = fixture(action);
    const newer = { ...f.recovery.response.state, revision: 12, balanceEur: 50_000_000,
      coach: { id: "455907", tier: "sapphire-blue" as const, valueEur: 10_000_000 }, formationCode: "4-4-2" };
    const original = structuredClone(newer);
    const result = decideClubCoachRecovery(f.retained, { ...f.current, confirmedState: newer }, f.recovery);
    assert.equal(result.status, "confirmed");
    if (result.status !== "confirmed") throw Error("not confirmed");
    assert.deepEqual(result.snapshot, { action: "preserve" });
    assert.equal(result.receipt.revision, f.recovery.operationRevision);
    assert.deepEqual(newer, original);
  }
});

test("same operation revision is preserved only when the entire confirmed snapshot agrees", () => {
  const f = fixture(), state = f.recovery.response.state;
  const reordered = Object.fromEntries(Object.entries(state).reverse()) as ClubAcquisitionState;
  const good = decideClubCoachRecovery(f.retained, { ...f.current, confirmedState: reordered }, f.recovery);
  assert.equal(good.status, "confirmed");
  if (good.status === "confirmed") assert.deepEqual(good.snapshot, { action: "preserve" });
  for (const changed of [{ ...state, balanceEur: state.balanceEur + 1 }, { ...state, formationCode: "4-4-2" }]) {
    assert.deepEqual(decideClubCoachRecovery(f.retained, { ...f.current, confirmedState: changed }, f.recovery), { status: "pending", reason: "revision_conflict" });
  }
});

test("changed account, season or generation never accepts a late recovery", () => {
  const f = fixture();
  for (const current of [
    { ...f.current, authority: { ...authority, expectedAccountId: authority.expectedSeasonId } },
    { ...f.current, authority: { ...authority, expectedSeasonId: authority.expectedAccountId } },
    ...[8, -1, NaN, 1.5].map(generation => ({ ...f.current, generation })),
  ]) assert.deepEqual(decideClubCoachRecovery(f.retained, current, f.recovery), { status: "pending", reason: "context_changed" });
  assert.deepEqual(decideClubCoachRecovery({ ...f.retained, generation: -1 }, f.current, f.recovery), { status: "pending", reason: "context_changed" });
});

test("the active pending command must still match every original command field", () => {
  const f = fixture();
  for (const command of [null, { ...release, currentCoachId: "308" }, { ...release, idempotencyKey: "coach_release_02" },
    { ...release, expectedRevision: 4 }, { ...release, amount: 1 }, hire]) {
    assert.deepEqual(decideClubCoachRecovery(f.retained, { ...f.current, command }, f.recovery), { status: "pending", reason: "command_changed" });
  }
});

test("missing and unresolved recovery cannot infer success from vacancy or current balance", () => {
  const f = fixture(), current = { ...f.current, confirmedState: f.recovery.response.state };
  for (const recovery of [null, undefined, {}, { status: "not_observed", resolved: false }, { status: "unavailable", resolved: false },
    { ...f.recovery, resolved: false }]) {
    assert.deepEqual(decideClubCoachRecovery(f.retained, current, recovery), { status: "pending", reason: "unconfirmed" });
  }
});

test("canonical parser rejects forged response, historical before, fees and operation revision", () => {
  const f = fixture();
  for (const recovery of [{ ...f.recovery, operationRevision: 9 }, { ...f.recovery, extra: true },
    { ...f.recovery, response: { ...f.recovery.response, replayed: false } },
    { ...f.recovery, response: { ...f.recovery.response, accountId: authority.expectedSeasonId } },
    { ...f.recovery, response: { ...f.recovery.response, receipt: { ...f.recovery.response.receipt, feeCredits: 0 } } }]) {
    assert.deepEqual(decideClubCoachRecovery(f.retained, f.current, recovery), { status: "pending", reason: "invalid_response" });
  }
  assert.deepEqual(decideClubCoachRecovery({ ...f.retained, before: f.recovery.response.state }, f.current, f.recovery), { status: "pending", reason: "invalid_response" });
});

test("missing, malformed, foreign-season or older confirmed collection remains pending", () => {
  const f = fixture(), state = f.current.confirmedState!;
  for (const confirmedState of [null, { ...state, revision: 2 }, { ...state, balanceEur: -1 },
    { ...state, seasonId: authority.expectedAccountId }, { ...state, coach: undefined } as unknown as ClubAcquisitionState]) {
    assert.deepEqual(decideClubCoachRecovery(f.retained, { ...f.current, confirmedState }, f.recovery), { status: "pending", reason: "invalid_current" });
  }
});

test("same before revision with altered content is a conflict, not authority for replacement", () => {
  const f = fixture(), confirmedState = { ...f.current.confirmedState!, balanceEur: 1 };
  assert.deepEqual(decideClubCoachRecovery(f.retained, { ...f.current, confirmedState }, f.recovery), { status: "pending", reason: "revision_conflict" });
});
