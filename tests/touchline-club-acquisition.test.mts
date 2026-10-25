import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireClubPlayer, inspectClubAcquisition, CLUB_ACQUISITION_BUDGETS, CLUB_COACH_VALUES,
  CLUB_POSITION_LIMITS, type ClubAcquisitionState, type ClubAcquisitionCommand, type PublishedClubOffer,
} from "../lib/touchlineFantasy/club-acquisition.ts";
import { type ClubRosterEntry, validateClubRoster } from "../lib/touchlineFantasy/club-roster.ts";

const state = (): ClubAcquisitionState => ({
  revision: 0, seasonId: "2026-27", plan: "standard", balanceEur: 495_000_000,
  coach: { id: "coach", tier: "ruby-red", valueEur: 5_000_000 }, players: [], receipts: [],
});
const offer: PublishedClubOffer = { playerId: "player", clubId: "club", position: "GK", valueEur: 10_000_000, published: true };
const command: ClubAcquisitionCommand = { playerId: offer.playerId, area: "outside", slot: 0, expectedRevision: 0, idempotencyKey: "purchase_1" };
const context = { marketOpen: true, offer, allowedClubIds: null };
const reject = (fn: () => unknown, code: string) => assert.throws(fn, error => error instanceof Error && error.message === code);

test("only explicit paid-plan coach vacancy is valid; missing or malformed coach stays invalid", () => {
  for (const plan of ["standard", "master", "vip"] as const) {
    const vacant: ClubAcquisitionState = { ...state(), plan, coach: null };
    const original = structuredClone(vacant);
    assert.equal(inspectClubAcquisition(vacant).vacantCount, 35);
    assert.deepEqual(vacant, original);
    const purchased = acquireClubPlayer(vacant, command, context);
    assert.equal(purchased.state.coach, null);
    assert.equal(purchased.state.balanceEur, vacant.balanceEur - offer.valueEur);
    assert.deepEqual(purchased.receipt, { key: command.idempotencyKey, playerId: offer.playerId, area: command.area, slot: command.slot, valueEur: offer.valueEur, revision: 1 });
    reject(() => acquireClubPlayer(vacant, command, { ...context, marketOpen: false }), "CLUB_MARKET_CLOSED");
  }
  reject(() => inspectClubAcquisition({ ...state(), plan: "beta", coach: null }), "CLUB_BETA_COACH_REQUIRED");
  const missing: Record<string, unknown> = { ...state() }; delete missing.coach;
  reject(() => inspectClubAcquisition(missing as unknown as ClubAcquisitionState), "CLUB_COACH_INVALID");
  for (const coach of [undefined, false, 0, "", [], {}, { id: " ", tier: "ruby-red", valueEur: 5_000_000 }, { id: 1, tier: "ruby-red", valueEur: 5_000_000 }]) {
    reject(() => inspectClubAcquisition({ ...state(), coach } as unknown as ClubAcquisitionState), "CLUB_COACH_INVALID");
  }
});

test("approved four budgets, seven coach prices, nine exact position quotas total 35", () => {
  assert.deepEqual(CLUB_ACQUISITION_BUDGETS, { beta: 100_000_000, standard: 750_000_000, master: 1_500_000_000, vip: 3_000_000_000 });
  assert.deepEqual(Object.values(CLUB_COACH_VALUES), [5, 10, 15, 25, 35, 50, 70].map(n => n * 1_000_000));
  assert.deepEqual(CLUB_POSITION_LIMITS, { GK: 3, CB: 6, RB: 3, LB: 3, DM: 5, MID: 5, RW: 3, LW: 3, CF: 4 });
  assert.equal(Object.values(CLUB_POSITION_LIMITS).reduce((a, b) => a + b), 35);
});
test("acquisition preserves nominal card value, deducts only its price and leaves input untouched", () => {
  const original = state(), before = structuredClone(original);
  const next = acquireClubPlayer(original, command, context);
  assert.deepEqual(original, before);
  assert.equal(next.replayed, false);
  assert.equal(next.state.balanceEur, 485_000_000);
  assert.equal(next.state.players[0].valueEur, 10_000_000);
  assert.equal(next.state.revision, 1);
  assert.equal(next.state.receipts.length, 1);
  assert.equal(inspectClubAcquisition(next.state).vacantCount, 34);
});
test("completed retry after market close returns prior receipt without charging twice", () => {
  const first = acquireClubPlayer(state(), command, context);
  const replay = acquireClubPlayer(first.state, command, { ...context, marketOpen: false, offer: null });
  assert.equal(replay.replayed, true);
  assert.strictEqual(replay.state, first.state);
  assert.strictEqual(replay.receipt, first.receipt);
  for (const changed of [{ playerId: "other" }, { slot: 1 }, { area: "reserves" as const }]) {
    reject(() => acquireClubPlayer(first.state, { ...command, ...changed }, context), "CLUB_IDEMPOTENCY_CONFLICT");
  }
});
test("concurrent stale purchase cannot spend an obsolete balance or fill a second slot", () => {
  const first = acquireClubPlayer(state(), command, context);
  reject(() => acquireClubPlayer(first.state, { ...command, playerId: "other", slot: 1, idempotencyKey: "purchase_2" }, {
    ...context, offer: { ...offer, playerId: "other" },
  }), "CLUB_STALE_REVISION");
  assert.equal(first.state.balanceEur, 485_000_000);
});
test("closed market, missing/unpublished/mismatched offer, insufficient funds fail without mutation", () => {
  reject(() => acquireClubPlayer(state(), command, { ...context, marketOpen: false }), "CLUB_MARKET_CLOSED");
  for (const invalid of [null, { ...offer, published: false }, { ...offer, playerId: "other" }]) {
    reject(() => acquireClubPlayer(state(), command, { ...context, offer: invalid }), "CLUB_OFFER_UNAVAILABLE");
  }
  reject(() => acquireClubPlayer({ ...state(), balanceEur: 9_999_999 }, command, context), "CLUB_INSUFFICIENT_BALANCE");
  assert.equal(acquireClubPlayer({ ...state(), balanceEur: offer.valueEur }, command, context).state.balanceEur, 0);
});
test("invalid currency amounts and fractional, negative and forged slots fail closed", () => {
  for (const valueEur of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    reject(() => acquireClubPlayer(state(), command, { ...context, offer: { ...offer, valueEur } }), "CLUB_PRICE_INVALID");
  }
  for (const slot of [-1, 15, 0.5, NaN]) {
    reject(() => acquireClubPlayer(state(), { ...command, slot }, context), "CLUB_ROSTER_INVALID");
  }
  for (const area of ["total", "__proto__", "constructor"]) {
    assert.deepEqual(validateClubRoster([{ playerId: "p", area, slot: 0 } as ClubRosterEntry]), ["INVALID_SLOT"]);
  }
});
test("same player or occupied destination cannot be bought again", () => {
  const first = acquireClubPlayer(state(), command, context).state;
  reject(() => acquireClubPlayer(first, { ...command, expectedRevision: 1, idempotencyKey: "purchase_2" }, context), "CLUB_ALREADY_OWNED");
  reject(() => acquireClubPlayer(first, { ...command, playerId: "other", expectedRevision: 1, idempotencyKey: "purchase_2" }, {
    ...context, offer: { ...offer, playerId: "other" },
  }), "CLUB_SLOT_OCCUPIED");
});
test("Beta stays on the existing flow; the new paid collection cannot activate a six-club Beta", () => {
  const beta = { ...state(), plan: "beta" as const, balanceEur: 45_000_000 };
  for (const allowedClubIds of [null, [], ["club"], Array(6).fill("club"), ["club", "a", "b", "c", "d", " "]]) {
    reject(() => acquireClubPlayer(beta, command, { ...context, allowedClubIds }), "CLUB_COLLECTION_PAID_PLAN_REQUIRED");
  }
  const allowed = ["club", "a", "b", "c", "d", "e"];
  reject(() => acquireClubPlayer(beta, command, { ...context, allowedClubIds: allowed }), "CLUB_COLLECTION_PAID_PLAN_REQUIRED");
  reject(() => acquireClubPlayer(state(), command, { ...context, allowedClubIds: ["other"] }), "CLUB_CLUB_NOT_ALLOWED");
  reject(() => inspectClubAcquisition({ ...beta, coach: { id: "coach", tier: "diamond-gold", valueEur: 70_000_000 } }), "CLUB_BETA_COACH_REQUIRED");
});
test("each exact quota is enforced separately, including left and right wings", () => {
  for (const position of Object.keys(CLUB_POSITION_LIMITS) as (keyof typeof CLUB_POSITION_LIMITS)[]) {
    const players = Array.from({ length: CLUB_POSITION_LIMITS[position] }, (_, slot) => ({ ...offer, clubId: `club-${slot}`, playerId: `owned-${slot}`, position, area: "outside" as const, slot }));
    const full = { ...state(), players };
    reject(() => acquireClubPlayer(full, { ...command, slot: players.length }, { ...context, offer: { ...offer, position } }), "CLUB_POSITION_FULL");
    if (position === "RW") {
      const accepted = acquireClubPlayer(full, { ...command, slot: players.length }, { ...context, offer: { ...offer, position: "LW" } });
      assert.equal(accepted.state.players.length, 4);
    }
  }
});
test("fill all 35 from one real club within budgets and reject the 36th; slots remain 11/9/15", () => {
  let current = state(), index = 0;
  for (const position of Object.keys(CLUB_POSITION_LIMITS) as (keyof typeof CLUB_POSITION_LIMITS)[]) {
    for (let i = 0; i < CLUB_POSITION_LIMITS[position]; i++, index++) {
      const area = index < 11 ? "starters" : index < 20 ? "reserves" : "outside";
      const slot = index < 11 ? index : index < 20 ? index - 11 : index - 20;
      current = acquireClubPlayer(current, {
        ...command, playerId: `p-${index}`, area, slot, expectedRevision: index, idempotencyKey: `purchase_${index}`,
      }, { ...context, offer: { ...offer, clubId: "one-real-club", playerId: `p-${index}`, position, valueEur: 1_000_000 } }).state;
    }
  }
  assert.equal(inspectClubAcquisition(current).vacantCount, 0);
  assert.equal(current.balanceEur, 460_000_000);
  assert.equal(current.players.filter(p => p.area === "reserves").length, 9);
  reject(() => acquireClubPlayer(current, { ...command, expectedRevision: 35, idempotencyKey: "purchase_36" }, context), "CLUB_ROSTER_FULL");
});
test("corrupt revision, receipt, coach cost and wallet are rejected", () => {
  reject(() => inspectClubAcquisition({ ...state(), revision: -1 }), "CLUB_REVISION_INVALID");
  reject(() => inspectClubAcquisition({ ...state(), balanceEur: NaN }), "CLUB_BALANCE_INVALID");
  reject(() => inspectClubAcquisition({ ...state(), coach: { ...state().coach!, valueEur: 1 } }), "CLUB_COACH_INVALID");
  const acquired = acquireClubPlayer(state(), command, context).state;
  reject(() => inspectClubAcquisition({ ...acquired, receipts: [...acquired.receipts, ...acquired.receipts] }), "CLUB_RECEIPTS_INVALID");
  reject(() => inspectClubAcquisition({ ...acquired, receipts: [{ ...acquired.receipts[0], revision: 2 }] }), "CLUB_RECEIPTS_INVALID");
});
