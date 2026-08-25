import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTouchlineFantasyLineupRequest,
  rankTouchlineFantasyManagers,
  touchlineFantasyFixtureContribution,
  touchlineFantasyGameweekScore,
  validateTouchlineFantasyLineup,
} from "../lib/touchlineFantasy/domain.ts";
import { resolveTouchlineFormationGeometry } from "../lib/touchlineArena/formation-geometry.ts";

const PLAYER_IDS = Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);

test("Rating is the sole score and the hat-trick multiplier is applied once", () => {
  for (const goals of [0, 1, 2]) {
    assert.deepEqual(touchlineFantasyFixtureContribution({ appearanceStatus: "started", rating: 8, goals }), {
      rating: 8,
      goals,
      hatTrickMultiplier: 1,
      roundScore: 8,
      participation: "rated_appearance",
      reason: "RATED_APPEARANCE",
    });
  }
  for (const goals of [3, 4, 5, 6]) {
    assert.deepEqual(touchlineFantasyFixtureContribution({ appearanceStatus: "substitute", rating: 8, goals }), {
      rating: 8,
      goals,
      hatTrickMultiplier: 2,
      roundScore: 16,
      participation: "rated_appearance",
      reason: "RATED_APPEARANCE",
    });
  }
});

test("missing provider Rating remains null and contributes zero", () => {
  assert.deepEqual(touchlineFantasyFixtureContribution({ appearanceStatus: "substitute", rating: null, goals: 0 }), {
    rating: null,
    goals: 0,
    hatTrickMultiplier: 1,
    roundScore: 0,
    participation: "no_provider_rating",
    reason: "NO_PROVIDER_RATING",
  });
  assert.deepEqual(touchlineFantasyFixtureContribution({ appearanceStatus: "unused", rating: 9.9, goals: 0 }), {
    rating: null,
    goals: 0,
    hatTrickMultiplier: 1,
    roundScore: 0,
    participation: "did_not_play",
    reason: "DID_NOT_PLAY",
  });
});

test("double Gameweek adds per-fixture Round Scores", () => {
  assert.equal(touchlineFantasyGameweekScore([
    touchlineFantasyFixtureContribution({ appearanceStatus: "started", rating: 7.5, goals: 0 }),
    touchlineFantasyFixtureContribution({ appearanceStatus: "started", rating: 8.21, goals: 3 }),
  ]), 23.92);
});

test("manager rankings expose only public identity and current-manager state", () => {
  const ranking = rankTouchlineFantasyManagers([
    { userId: PLAYER_IDS[0], name: "Manager B", score: 7.5 },
    { userId: PLAYER_IDS[1], name: "Manager A", score: 9.25 },
  ], PLAYER_IDS[0]);
  assert.deepEqual(ranking, [
    { rank: 1, name: "Manager A", score: 9.25, isCurrentManager: false },
    { rank: 2, name: "Manager B", score: 7.5, isCurrentManager: true },
  ]);
  assert.equal("userId" in ranking[0], false);
});

test("lineup validation enforces 11, formation, budget and club limit", () => {
  const geometry = resolveTouchlineFormationGeometry("4-3-3");
  const buckets = [
    "goalkeeper",
    "right-back", "centre-back", "centre-back", "left-back",
    "midfield", "midfield", "defensive-midfield",
    "attacker", "centre-forward", "attacker",
  ] as const;
  const players = geometry.slots.map((slot, index) => ({
    playerId: PLAYER_IDS[index],
    clubId: `club-${index % 4}`,
    marketValueEur: 20_000_000,
    positionBucket: buckets[index],
  }));
  const selections = geometry.slots.map((slot, index) => ({ playerId: PLAYER_IDS[index], slotId: slot.id }));
  const valid = validateTouchlineFantasyLineup({
    selections,
    players,
    geometry,
    budgetEur: 350_000_000,
    maxPlayersPerClub: 3,
    requireComplete: true,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.totalMarketValueEur, 220_000_000);

  const ten = validateTouchlineFantasyLineup({ ...validInput(), selections: selections.slice(0, 10), players });
  assert.ok(ten.issues.includes("SELECTION_COUNT"));
  const twelve = validateTouchlineFantasyLineup({
    ...validInput(),
    selections: [...selections, { playerId: PLAYER_IDS[11], slotId: "EXTRA" }],
    players: [...players, { playerId: PLAYER_IDS[11], clubId: "club-9", marketValueEur: 1, positionBucket: "attacker" }],
  });
  assert.ok(twelve.issues.includes("SELECTION_COUNT"));

  function validInput() {
    return { geometry, budgetEur: 350_000_000, maxPlayersPerClub: 3, requireComplete: true } as const;
  }
});

test("request parser rejects malformed, oversized and untrusted payloads", () => {
  const valid = parseTouchlineFantasyLineupRequest({
    gameweekId: PLAYER_IDS[0],
    formationCode: "4-3-3",
    selections: [{ playerId: PLAYER_IDS[1], slotId: "GK" }],
    action: "draft",
    idempotencyKey: "fantasy:request:001",
  });
  assert.ok(valid);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, action: "publish" }), null);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, selections: Array(12).fill(valid?.selections[0]) }), null);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, gameweekId: "not-a-uuid" }), null);
});
