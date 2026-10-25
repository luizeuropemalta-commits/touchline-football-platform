import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { squadSwapComparisonPlayers } from "../lib/touchlineFantasy/squad-swap-presentation.ts";
import type { ClubRosterArea } from "../lib/touchlineFantasy/club-roster.ts";

const players: Readonly<Record<ClubRosterArea, Readonly<{ playerId: string; area: ClubRosterArea; slot: number; valueEur: number }>>> = {
  starters: Object.freeze({ playerId: "starter", area: "starters", slot: 8, valueEur: 2_000_000 }),
  reserves: Object.freeze({ playerId: "reserve", area: "reserves", slot: 6, valueEur: 3_000_000 }),
  outside: Object.freeze({ playerId: "outside", area: "outside", slot: 0, valueEur: 4_000_000 }),
};
const directions: readonly [ClubRosterArea, ClubRosterArea, ClubRosterArea, ClubRosterArea][] = [
  ["starters", "reserves", "reserves", "starters"],
  ["reserves", "starters", "reserves", "starters"],
  ["starters", "outside", "outside", "starters"],
  ["outside", "starters", "outside", "starters"],
  ["reserves", "outside", "outside", "reserves"],
  ["outside", "reserves", "outside", "reserves"],
];
for (const [origin, target, incoming, outgoing] of directions) {
  test(`swap opened from ${origin} to ${target}: IN left / OUT right`, () => {
    const before = JSON.stringify(players);
    const comparison = squadSwapComparisonPlayers(players[origin], players[target]);
    assert.equal(comparison.length, 2);
    assert.equal(comparison[0], players[incoming], "original incoming player identity and contract are retained");
    assert.equal(comparison[1], players[outgoing], "original outgoing player identity and contract are retained");
    assert.equal(JSON.stringify(players), before, "presentation never mutates allocation, values or slots");
  });
}

test("vacant or missing slot does not manufacture an outgoing comparison card", () => {
  for (const absent of [null, undefined]) {
    assert.deepEqual(squadSwapComparisonPlayers(players.reserves, absent), []);
    assert.deepEqual(squadSwapComparisonPlayers(absent, players.reserves), []);
  }
});

test("same-area pairing is not presented as a supported group substitution", () => {
  assert.deepEqual(squadSwapComparisonPlayers(players.reserves, { ...players.reserves, playerId: "another-reserve", slot: 7 }), []);
});

test("real dialog uses area-independent presentation without changing the chosen move", () => {
  const source = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerCollectionSlots.tsx", import.meta.url), "utf8");
  assert.match(source, /const comparisonPlayers = squadSwapComparisonPlayers\(source, counterpart\);/);
  assert.match(source, /await onMove\(choice\.playerId, choice\.destination\)/);
  assert.match(source, /data-swap-side=\{index === 0 \? "in" : "out"\}/);
  assert.match(source, /className=\{layout\.swapSummary\}/);
  assert.match(source, /liveSeasonRating=\{liveSeasonRating\} compact fitContainer/);
});
