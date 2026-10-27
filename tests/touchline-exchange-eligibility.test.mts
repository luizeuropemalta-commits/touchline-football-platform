import test from "node:test";
import assert from "node:assert/strict";
import { CLUB_ROSTER_CAPACITY } from "../lib/touchlineFantasy/club-roster.ts";
import { changeAllocatedListing, inspectExchangeAllocation, validateExchangePair, type ExchangeAllocation } from "../lib/touchlineFantasy/exchange-eligibility.ts";

function club(ownerId: string): ExchangeAllocation {
  return { ownerId, plan: "standard", lineupLocked: false, listedIds: [`${ownerId}-outside-0`], reservations: [], unavailableIds: [],
    players: (["starters", "reserves", "outside"] as const).flatMap(area => Array.from({ length: CLUB_ROSTER_CAPACITY[area] }, (_, slot) => ({
      playerId: `${ownerId}-${area}-${slot}`, area, slot, position: "CB" as const,
    }))),
  };
}
const pair = (a: ExchangeAllocation, b: ExchangeAllocation, proposal?: string) => validateExchangePair(a, b, "a-outside-0", "b-outside-0", proposal);

test("Exchange eligibility is independent of the existing lineup lock, receipts stay outside", () => {
  for (const aLocked of [false, true]) for (const bLocked of [false, true]) {
    const a = { ...club("a"), lineupLocked: aLocked }, b = { ...club("b"), lineupLocked: bLocked };
    const result = pair(a, b);
    assert.equal(result.senderCanEditLineup, !aLocked);
    assert.equal(result.receiverCanEditLineup, !bLocked);
    assert.deepEqual(result.senderReceipt, { ...a.players[20], playerId: "b-outside-0" });
    assert.equal(result.receiverReceipt.area, "outside");
    assert.equal(a.players[20].playerId, "a-outside-0");
  }
});
test("every one of the twenty related players is refused, for either participant", () => {
  const a = club("a"), b = club("b");
  for (const player of a.players.slice(0, 20)) {
    assert.throws(() => validateExchangePair(a, b, player.playerId, "b-outside-0"), /MATCH_RELATED/);
    assert.throws(() => changeAllocatedListing(a, player.playerId, true), /RELATED/);
  }
  for (const player of b.players.slice(0, 20)) assert.throws(() => validateExchangePair(a, b, "a-outside-0", player.playerId), /MATCH_RELATED/);
});
test("zero to eleven chosen listings leave at least four free, but twelve are refused", () => {
  let a = { ...club("a"), listedIds: [] } as ExchangeAllocation;
  for (let n = 0; n < 11; n++) {
    a = changeAllocatedListing(a, `a-outside-${n}`, true);
    assert.equal(inspectExchangeAllocation(a).freeOutsideIds.length, 14 - n);
  }
  assert.throws(() => changeAllocatedListing(a, "a-outside-11", true), /EMERGENCY/);
});
test("withdrawn publicity retains proposal reservation and cannot consume an emergency slot", () => {
  const a = { ...club("a"), listedIds: Array.from({ length: 11 }, (_, n) => `a-outside-${n}`),
    reservations: [{ playerId: "a-outside-0", proposalId: "p1" }] };
  const removed = changeAllocatedListing(a, "a-outside-0", false);
  assert.equal(removed.listedIds.length, 10);
  assert.equal(inspectExchangeAllocation(removed).freeOutsideIds.length, 4);
  assert.equal(removed.reservations, a.reservations);
  assert.throws(() => changeAllocatedListing(removed, "a-outside-11", true), /EMERGENCY/);
});
test("same-position rule does not merge left/right wings or allow unknown roles", () => {
  for (const position of ["RW", "LW", null] as const) {
    const b = club("b");
    assert.throws(() => pair(club("a"), { ...b, players: b.players.map(p => p.playerId === "b-outside-0" ? { ...p, position } : p) }), /SAME_POSITION/);
  }
  const a = club("a"), b = club("b");
  const withPosition = (state: ExchangeAllocation, position: "RW" | "LW") => ({
    ...state, players: state.players.map(p => p.area === "outside" && p.slot === 0 ? { ...p, position } : p),
  });
  assert.throws(() => pair(withPosition(a, "RW"), withPosition(b, "LW")), /SAME_POSITION/);
  assert.doesNotThrow(() => pair(withPosition(a, "RW"), withPosition(b, "RW")));
});
test("only the exact pending proposal can use its reservation after withdrawal", () => {
  const held = (id: string) => ({ ...club(id), listedIds: [], reservations: [{ playerId: `${id}-outside-0`, proposalId: "p1" }] });
  assert.doesNotThrow(() => pair(held("a"), held("b"), "p1"));
  assert.throws(() => pair(held("a"), held("b")), /RESERVED/);
  assert.throws(() => pair(held("a"), held("b"), "another"), /RESERVATION/);
  assert.throws(() => pair(club("a"), held("b"), "p1"), /RESERVATION/);
});
test("incomplete or duplicated ownership and invalid reservation data fail closed", () => {
  const a = club("a");
  for (const players of [a.players.slice(1), [...a.players.slice(0, 34), a.players[0]]])
    assert.throws(() => inspectExchangeAllocation({ ...a, players }), /COMPLETE_ROSTER/);
  assert.throws(() => inspectExchangeAllocation({ ...a, reservations: [{ playerId: "unknown", proposalId: "p" }] }), /RESERVATION/);
  assert.throws(() => inspectExchangeAllocation({ ...a, unavailableIds: ["unknown"] }), /AVAILABILITY/);
  assert.throws(() => pair({ ...a, plan: "unknown" as "beta" }, club("b")), /EXCHANGE_PLAN/);
});
test("unlisted, unavailable, foreign and self trades are refused without modifying cards", () => {
  const a = club("a"), b = club("b");
  assert.throws(() => pair({ ...a, listedIds: [] }, b), /NOT_LISTED/);
  assert.throws(() => pair({ ...a, unavailableIds: ["a-outside-0"] }, b), /UNAVAILABLE/);
  assert.throws(() => validateExchangePair(a, b, "not-owned", "b-outside-0"), /OWNERSHIP/);
  assert.throws(() => pair(a, { ...b, ownerId: "a" }), /SELF_EXCHANGE/);
  assert.equal(a.players.length, 35);
});


test("approved Beta economics can validate an allocation without enabling the collection or bypassing slot rules", () => {
  const a = { ...club("a"), plan: "beta" as const };
  assert.doesNotThrow(() => pair(a, club("b")));
  assert.doesNotThrow(() => pair(club("a"), { ...club("b"), plan: "beta" }));
  assert.throws(() => pair({ ...a, players: a.players.slice(1) }, club("b")), /COMPLETE_ROSTER/);
  assert.throws(() => validateExchangePair(a, club("b"), "a-starters-0", "b-outside-0"), /MATCH_RELATED/);
});
