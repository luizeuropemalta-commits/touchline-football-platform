import assert from "node:assert/strict";
import test from "node:test";
import { clubBudgetAffordability, type AffordabilityInput } from "../lib/touchlineFantasy/club-budget-affordability.ts";
import { CLUB_POSITION_LIMITS } from "../lib/touchlineFantasy/club-acquisition.ts";

function fixture(): AffordabilityInput {
  const players = Object.entries(CLUB_POSITION_LIMITS).flatMap(([position, count]) => Array.from({ length: count }, (_, i) => ({ playerId: `${position}${i}`, position: position as keyof typeof CLUB_POSITION_LIMITS })));
  return { verificationStatus: "confirmed", nowMs: 100,
    state: { seasonId: "season", revision: 43, balanceEur: 50, coach: { id: "coach-paid-already" }, players: players.filter(p => p.playerId !== "GK0") },
    catalogue: { proof: { complete: true, verified: true, seasonId: "season", collectionRevision: 43, observedAtMs: 90, validUntilMs: 110 }, offers: [{ playerId: "newGK", position: "GK", price: 60, priceState: "verified", positionVerified: true }] } };
}
test("cost overflow above MAX_SAFE_INTEGER is indeterminate, never insufficient", () => {
  const input = fixture(), offer = input.catalogue!.offers[0];
  const result = clubBudgetAffordability({ ...input,
    state: { ...input.state!, players: input.state!.players.filter(player => player.playerId !== "GK1") },
    catalogue: { ...input.catalogue!, offers: [
      { ...offer, playerId: "newGK1", price: Number.MAX_SAFE_INTEGER },
      { ...offer, playerId: "newGK2", price: 1 },
    ] },
  });
  assert.deepEqual(result, { status: "indeterminate", reason: "cost-overflow" });
});
test("expensive missing GK proves shortfall only with full verified proof; inputs unchanged", () => {
  const input = fixture(), before = JSON.stringify(input);
  const result = clubBudgetAffordability(input);
  assert.equal(result.status, "insufficient");
  if (result.status === "indeterminate") throw Error("unexpected");
  assert.equal(result.minimumCost, 60); assert.equal(result.shortfall, 10); assert.equal(result.missing.GK, 1);
  assert.equal(JSON.stringify(input), before);
});
test("fitting lower bound never guarantees tactical feasibility and never charges coach again", () => {
  const input = fixture();
  const result = clubBudgetAffordability({ ...input, state: { ...input.state!, balanceEur: 60 } });
  assert.equal(result.status, "lower-bound-only");
  if (result.status === "indeterminate") throw Error("unexpected");
  assert.equal(result.shortfall, 0); assert.equal(result.guaranteed, false);
});
test("partial, stale, mismatched and unconfirmed inputs are indeterminate", () => {
  const input = fixture();
  const variants: AffordabilityInput[] = [
    { ...input, verificationStatus: "pending" }, { ...input, verificationStatus: "unavailable" },
    { ...input, state: { ...input.state!, coach: null } },
    { ...input, catalogue: { ...input.catalogue!, proof: null } },
    { ...input, nowMs: 111 }, { ...input, nowMs: 89 },
    { ...input, state: { ...input.state!, revision: 44 } },
    { ...input, state: { ...input.state!, seasonId: "other" } },
  ];
  for (const variant of variants) assert.equal(clubBudgetAffordability(variant).status, "indeterminate");
});
test("missing offers, duplicate IDs, provisional price and unverified position never prove insufficiency", () => {
  const input = fixture(), offer = input.catalogue!.offers[0];
  for (const offers of [[], [offer, offer], [{ ...offer, priceState: "provisional" as const }], [{ ...offer, price: 0 }], [{ ...offer, positionVerified: false }]]) {
    assert.equal(clubBudgetAffordability({ ...input, catalogue: { ...input.catalogue!, offers } }).status, "indeterminate");
  }
});
test("owned identities cannot fill vacancy; different missing positions cannot use cheap GK", () => {
  const input = fixture(), offer = input.catalogue!.offers[0];
  assert.equal(clubBudgetAffordability({ ...input, catalogue: { ...input.catalogue!, offers: [{ ...offer, playerId: "GK1" }] } }).status, "indeterminate");
  const players = [...input.state!.players.filter(p => p.playerId !== "CF0"), { playerId: "GK0", position: "GK" as const }];
  assert.equal(clubBudgetAffordability({ ...input, state: { ...input.state!, players } }).status, "indeterminate");
});
test("complete collection costs zero; duplicate owned IDs fail closed", () => {
  const input = fixture();
  const players = [...input.state!.players, { playerId: "GK0", position: "GK" as const }];
  const result = clubBudgetAffordability({ ...input, state: { ...input.state!, players, balanceEur: 0 } });
  assert.equal(result.status, "complete");
  if (result.status === "indeterminate") throw Error("unexpected");
  assert.equal(result.minimumCost, 0);
  assert.equal(clubBudgetAffordability({ ...input, state: { ...input.state!, players: [...players, players[0]] } }).status, "indeterminate");
});

test("paid vacancy is explicit but cannot prove affordability without the future coach price", () => {
  const input = fixture();
  for (const plan of ["standard", "master", "vip"] as const) {
    const state = { ...input.state!, plan, coach: null };
    const before = structuredClone(state);
    assert.deepEqual(clubBudgetAffordability({ ...input, state }), { status: "indeterminate", reason: "coach-vacant" });
    assert.deepEqual(state, before);
  }
  for (const plan of ["beta", undefined] as const) {
    assert.deepEqual(clubBudgetAffordability({ ...input, state: { ...input.state!, plan, coach: null } }), { status: "indeterminate", reason: "coach-unconfirmed" });
  }
  assert.deepEqual(clubBudgetAffordability({ ...input, state: { ...input.state!, plan: "vip", coach: undefined } as unknown as AffordabilityInput["state"] }), { status: "indeterminate", reason: "coach-unconfirmed" });
});
