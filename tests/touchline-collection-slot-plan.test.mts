import test from "node:test";
import assert from "node:assert/strict";
import { CLUB_RESERVE_POSITIONS, collectionSlotPlan, previewPlannedClubAllocation } from "../lib/touchlineFantasy/collection-slot-plan.ts";
import { CLUB_POSITION_LIMITS, type ClubOwnedPlayer, type ClubAcquisitionState } from "../lib/touchlineFantasy/club-acquisition.ts";
import { TOUCHLINE_DEFAULT_FORMATION_GEOMETRY_REGISTRY as formations } from "../lib/touchlineArena/formation-geometry.ts";
const details: Record<ClubOwnedPlayer["position"],string> = { GK:"Goalkeeper", CB:"Centre Back", RB:"Right Back", LB:"Left Back", DM:"Defensive Midfield", MID:"Central Midfield", RW:"Right Wing", LW:"Left Wing", CF:"Centre Forward" };

test("approved bench has nine distinct positions including both full-backs and wingers", () => {
  assert.deepEqual(CLUB_RESERVE_POSITIONS, ["GK", "CB", "RB", "LB", "DM", "MID", "RW", "LW", "CF"]);
});
test("every canonical formation reserves eleven plus nine and derives exactly fifteen outside positions", () => {
  for (const geometry of Object.values(formations)) {
    const plan = collectionSlotPlan(geometry);
    assert.ok(plan, geometry.formationCode);
    assert.equal(plan.outside.length, 15);
    const all = [...plan.starters, ...plan.reserves, ...plan.outside];
    for (const [position, count] of Object.entries(CLUB_POSITION_LIMITS)) assert.equal(all.filter(p => p === position).length, count, `${geometry.formationCode}:${position}`);
    assert.equal(plan.outside.filter(p => p === "GK").length, 1);
  }
});
test("4-3-3 outside calculation deducts empty tactical places, not only current contracts", () => {
  const plan = collectionSlotPlan(formations["4-3-3"])!;
  assert.deepEqual(plan.outside, ["GK", "CB", "CB", "CB", "RB", "LB", "DM", "DM", "DM", "DM", "MID", "RW", "LW", "CF", "CF"]);
});
test("filling all thirty-five planned places preserves the vacancy map at every step in every formation", () => {
  for (const geometry of Object.values(formations)) {
    const initial = collectionSlotPlan(geometry)!;
    const players: ClubOwnedPlayer[] = [];
    for (const area of ["starters", "reserves", "outside"] as const) {
      for (const [slot, position] of initial[area].entries()) {
        const tacticalId = area === "starters" ? geometry.slots[slot].id : null;
        const primaryDetail = position === "MID" && (tacticalId === "CAM" || geometry.formationCode === "3-4-2-1" && (tacticalId === "RAM" || tacticalId === "LAM")) ? "Attacking Midfield" : details[position];
        players.push({ playerId: `${area}-${slot}`, clubId: "one-real-club", area, slot, position, primaryDetail, valueEur: 1 });
        const before = structuredClone(players);
        assert.deepEqual(collectionSlotPlan(geometry, players), initial, `${geometry.formationCode}:${area}:${slot}`);
        assert.deepEqual(players, before);
      }
    }
    assert.equal(players.length, 35);
  }
});
test("existing outside contracts retain their exact persisted slot IDs and no input is mutated", () => {
  const players: ClubOwnedPlayer[] = [
    { playerId: "left-back", clubId: "club", area: "outside", slot: 0, position: "LB", primaryDetail:"Left Back", valueEur: 1 },
    { playerId: "right-back", clubId: "club", area: "outside", slot: 1, position: "RB", primaryDetail:"Right Back", valueEur: 1 },
  ];
  const before = structuredClone(players);
  const plan = collectionSlotPlan(formations["4-3-3"], players)!;
  assert.equal(plan.outside[0], "LB"); assert.equal(plan.outside[1], "RB");
  assert.equal(plan.outside.filter(p => p === "LB").length, 1);
  assert.equal(plan.outside.filter(p => p === "RB").length, 1);
  const afterSigning: ClubOwnedPlayer[] = [...players, { playerId: "keeper", clubId: "club", area: "outside", slot: 2, position: plan.outside[2], primaryDetail:details[plan.outside[2]], valueEur: 1 }];
  assert.deepEqual(collectionSlotPlan(formations["4-3-3"], afterSigning), plan);
  assert.deepEqual(players, before);
});
test("formation changes recalculate vacancies; impossible old allocation does not silently move or delete cards", () => {
  assert.notDeepEqual(collectionSlotPlan(formations["3-5-2"])?.outside, collectionSlotPlan(formations["4-3-3"])?.outside);
  assert.equal(collectionSlotPlan(null), null);
  const players: ClubOwnedPlayer[] = [{ playerId: "legacy", clubId: "club", area: "reserves", slot: 0, position: "CF", primaryDetail:"Centre Forward", valueEur: 1 }];
  assert.equal(collectionSlotPlan(formations["4-3-3"], players), null);
  assert.equal(players[0].position, "CF");
});

function fullSquad(): ClubAcquisitionState {
  const plan = collectionSlotPlan(formations["4-3-3"])!;
  const players = (["starters", "reserves", "outside"] as const).flatMap(area => plan[area].map((position, slot) => ({ playerId: `${area}-${slot}`, clubId: "club", position, primaryDetail:details[position], slot, area, valueEur: 1_000_000 })));
  return { plan: "vip", revision: 0, seasonId: "season", balanceEur: 100_000_000, coach: { id: "coach", tier: "sapphire-blue", valueEur: 10_000_000 }, formationCode: "4-3-3", players, receipts: [] };
}
test("a cross-wing swap cannot put a left winger into the right-wing bench place; same-position swap works", () => {
  const state = fullSquad(); const before = structuredClone(state);
  const geometry = formations["4-3-3"];
  const move = { action: "move" as const, playerId: "reserves-6", area: "starters" as const, slot: geometry.slots.findIndex(s => s.id === "LW"), expectedRevision: 0, idempotencyKey: "preview_move" };
  assert.equal(previewPlannedClubAllocation(state, move, geometry), null);
  const next = previewPlannedClubAllocation(state, { ...move, slot: geometry.slots.findIndex(s => s.id === "RW") }, geometry);
  assert.ok(next);
  assert.equal(next.players.find(p => p.area === "reserves" && p.slot === 6)?.position, "RW");
  assert.equal(next.balanceEur, state.balanceEur);
  assert.deepEqual(state, before);
});
test("every prospective formation either preserves a valid complete squad and wallet or refuses without mutation", () => {
  const state = fullSquad(); const before = structuredClone(state);
  let acceptedChanges = 0;
  for (const geometry of Object.values(formations)) {
    const next = previewPlannedClubAllocation(state, { action: "formation", formationCode: geometry.formationCode, expectedRevision: 0, idempotencyKey: "preview_formation" }, geometry);
    if (next) {
      if (geometry.formationCode !== state.formationCode) acceptedChanges++;
      assert.ok(collectionSlotPlan(geometry, next.players));
      assert.equal(next.balanceEur, state.balanceEur);
      assert.equal(next.players.length, 35);
      assert.deepEqual(next.players.map(p => p.playerId).sort(), state.players.map(p => p.playerId).sort());
      assert.deepEqual(next.receipts, state.receipts);
    }
    assert.deepEqual(state, before);
  }
  assert.ok(acceptedChanges > 0, "the guard must permit compatible formation changes, not reject every change");
});
test("actual defensive midfield starter reduces the outside DM count, without pretending it is a MID", () => {
  const geometry = formations["4-3-3"];
  const players: ClubOwnedPlayer[] = [{ playerId: "actual-dm", clubId: "club", area: "starters", slot: geometry.slots.findIndex(s => s.id === "CM"), position: "DM", primaryDetail:"Defensive Midfield", valueEur: 1 }];
  const plan = collectionSlotPlan(geometry, players)!;
  assert.equal(plan.outside.filter(p => p === "DM").length, 3);
  assert.equal(plan.outside.filter(p => p === "MID").length, 2);
});
