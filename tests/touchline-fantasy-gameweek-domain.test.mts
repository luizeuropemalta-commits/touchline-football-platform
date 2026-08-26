import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTouchlineFantasyDeadline,
  parseTouchlineFantasyLineupRequest,
  rankTouchlineFantasyManagers,
  resolveTouchlineFantasyBuilderStep,
  touchlineFantasyLandscapeIsBlocked,
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

test("lineup validation enforces 11, formation and budget while club choice remains customer-owned", () => {
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

  const sameClubPlayers = players.map((player) => ({ ...player, clubId: "one-club" }));
  assert.equal(validateTouchlineFantasyLineup({
    selections,
    players: sameClubPlayers,
    geometry,
    budgetEur: 350_000_000,
    maxPlayersPerClub: 1,
    requireComplete: true,
  }).valid, true, "all eleven eligible players may come from the same club");

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
    selectedCoachId: "307",
    formationCode: "4-3-3",
    selections: [{ playerId: PLAYER_IDS[1], slotId: "GK" }],
    action: "draft",
    idempotencyKey: "fantasy:request:001",
  });
  assert.ok(valid);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, action: "publish" }), null);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, selections: Array(12).fill(valid?.selections[0]) }), null);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, gameweekId: "not-a-uuid" }), null);
  assert.equal(parseTouchlineFantasyLineupRequest({ ...valid, selectedCoachId: "invented-coach" }), null);
});

test("guided builder requires coach, formation, exactly 11 valid players, then review", () => {
  assert.equal(resolveTouchlineFantasyBuilderStep({ editable: true, selectedCoachId: null, formationCode: null, selectedCount: 0, lineupValid: false }), "coach");
  assert.equal(resolveTouchlineFantasyBuilderStep({ editable: true, selectedCoachId: "307", formationCode: null, selectedCount: 0, lineupValid: false }), "formation");
  assert.equal(resolveTouchlineFantasyBuilderStep({ editable: true, selectedCoachId: "307", formationCode: "4-3-3", selectedCount: 10, lineupValid: false }), "players");
  assert.equal(resolveTouchlineFantasyBuilderStep({ editable: true, selectedCoachId: "307", formationCode: "4-3-3", selectedCount: 11, lineupValid: true }), "review");
  assert.equal(resolveTouchlineFantasyBuilderStep({ editable: false, selectedCoachId: "307", formationCode: "4-3-3", selectedCount: 11, lineupValid: true }), "locked");
});

test("only mobile landscape devices receive the rotate gate", () => {
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 844, height: 390, coarsePointer: true }), true);
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 1180, height: 820, coarsePointer: true }), true);
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 390, height: 844, coarsePointer: true }), false);
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 820, height: 1180, coarsePointer: true }), false);
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 874, height: 402, coarsePointer: false, mobileDevice: true }), true);
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 402, height: 874, coarsePointer: false, mobileDevice: true }), false);
  assert.equal(touchlineFantasyLandscapeIsBlocked({ width: 1440, height: 900, coarsePointer: false }), false);
});

test("the canonical deadline renders identically in server and browser time zones", () => {
  const deadline = "2026-08-21T19:55:00.000Z";
  assert.equal(formatTouchlineFantasyDeadline(deadline, "en-GB"), "21 Aug 2026, 20:55");
  assert.equal(formatTouchlineFantasyDeadline(deadline, "pt-BR"), "21 de ago. de 2026, 20:55");
  assert.equal(formatTouchlineFantasyDeadline("invalid", "en-GB"), "—");
});

test("the required formation matrix derives 11 position-aware slots from the canonical registry", () => {
  const formationCodes = ["4-2-3-1", "4-3-3", "4-4-2", "3-5-2", "3-4-2-1", "5-3-2"] as const;
  const coveredPositions = new Set<string>();

  for (const formationCode of formationCodes) {
    const geometry = resolveTouchlineFormationGeometry(formationCode);
    assert.equal(geometry.slots.length, 11, `${formationCode} must expose exactly 11 slots`);
    const players = geometry.slots.map((slot, index) => {
      const positionBucket = slot.allowedPositions[0];
      coveredPositions.add(positionBucket);
      return {
        playerId: PLAYER_IDS[index],
        clubId: `club-${index % 4}`,
        marketValueEur: 1_000_000,
        positionBucket,
      };
    });
    const selections = geometry.slots.map((slot, index) => ({
      playerId: PLAYER_IDS[index],
      slotId: slot.id,
    }));
    assert.equal(validateTouchlineFantasyLineup({
      selections,
      players,
      geometry,
      budgetEur: 350_000_000,
      maxPlayersPerClub: 3,
      requireComplete: true,
    }).valid, true, `${formationCode} must accept its own canonical slot map`);
  }

  for (const required of [
    "goalkeeper", "centre-back", "left-back", "right-back",
    "defensive-midfield", "midfield", "attacker", "centre-forward",
  ]) {
    assert.equal(coveredPositions.has(required), true, `${required} must be represented`);
  }
});
