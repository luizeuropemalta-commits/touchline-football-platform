import assert from "node:assert/strict";
import test from "node:test";

import type { TouchlineRankedPlayer } from "../lib/touchlineArena/card-ranking.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { buildTouchlineRankingFamilyCaption } from "../lib/touchlineArena/social-ranking-family-caption.ts";
import {
  countTouchlineConfirmedHatTrickGoals,
  selectTouchlineSocialRankingTopThree,
  selectTouchlineTopPerformer,
  touchlineConfirmedHatTrickGoalFact,
  touchlineGameweekIsFinal,
} from "../lib/touchlineArena/social-ranking-family-contract.ts";
import { checksumTouchlineRankingFamilyRenderSource } from "../lib/touchlineArena/social-ranking-family-render-source.ts";
import { touchlineSocialContentDefinition } from "../lib/touchlineArena/social-content-registry.ts";
import { touchlineSocialRenderPath } from "../lib/touchlineArena/social-publication-contract.ts";

const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
] as const;

function card(index: number, rating: number): ClubOwnerSquadCard {
  const providerId = String(1000 + index);
  return {
    id: providerId,
    canonicalPlayerId: IDS[index]!,
    name: `Player ${index + 1}`,
    shortName: `P${index + 1}`,
    clubName: index % 2 ? "Arsenal" : "Aston Villa",
    role: "midfielder",
    position: "Central Midfield",
    shirtNumber: index + 1,
    countryCode3: "ENG",
    marketValue: "Verified",
    cardTier: "diamond-gold",
    editorialCard: { tierKey: "diamond-gold" } as NonNullable<ClubOwnerSquadCard["editorialCard"]>,
    touchlinePoints: 0,
    seasonTotalRating: rating,
  };
}

function ranked(index: number, rating: number, minutes = 90): TouchlineRankedPlayer {
  const item = card(index, rating);
  return {
    playerId: item.canonicalPlayerId!,
    providerPlayerId: item.id,
    name: item.name,
    clubName: item.clubName,
    position: item.position,
    role: item.role,
    totalRating: rating,
    minutesPlayed: minutes,
    appearances: 1,
    positionGroup: "midfielder",
    positionRank: index + 1,
    groupSize: 4,
    tierKey: "diamond-gold",
    priceTc: 0,
  };
}

test("044 registry and render identity cover every Feed product", () => {
  for (const contentType of ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL", "PLAYER_DUEL",
    "GAMEWEEK_HERO", "TOP_PERFORMER", "HAT_TRICK_HERO"] as const) {
    assert.deepEqual(touchlineSocialContentDefinition(contentType), {
      module: "044", placement: "INSTAGRAM_FEED", width: 1080, height: 1350,
      scope: ["GAMEWEEK_RANKING_PREVIEW", "GAMEWEEK_RANKING_FINAL"].includes(contentType)
        ? "GAMEWEEK"
        : contentType === "PLAYER_DUEL" ? "FIXTURE"
          : contentType === "GAMEWEEK_HERO" ? "GAMEWEEK_PLAYER" : "FIXTURE_PLAYER",
    });
  }
  assert.equal(touchlineSocialRenderPath({
    contentType: "GAMEWEEK_HERO", fixtureId: "19722192", teamId: null,
    scopeId: "244001", playerId: "1000", locale: "en-GB", revision: 1,
  }), "/visual-qa/social-ranking?contentType=GAMEWEEK_HERO&fixtureId=19722192&scopeId=244001&playerId=1000&locale=en-GB&revision=1");
});

test("Top 3 uses the canonical rating/minutes/provider tie-break and published cards only", () => {
  const cards = [card(0, 8), card(1, 8), card(2, 7.9), card(3, 7.8)];
  const result = selectTouchlineSocialRankingTopThree({
    cards,
    rankingPlayers: [ranked(0, 8, 80), ranked(1, 8, 90), ranked(2, 7.9), ranked(3, 7.8)],
  });
  assert.deepEqual(result?.map((row) => row.card.id), ["1001", "1000", "1002"]);
  assert.equal(selectTouchlineSocialRankingTopThree({
    cards: cards.map((item, index) => index === 0 ? { ...item, editorialCard: null } : item),
    rankingPlayers: [ranked(0, 8), ranked(1, 8), ranked(2, 7.9), ranked(3, 7.8)],
  }), null);
});

test("Top performer orders by official Match Rating without converting it to points", () => {
  const cards = [card(0, 17.16), card(1, 16.53)];
  const winner = selectTouchlineTopPerformer({
    cards,
    requireFinal: true,
    settlements: [
      { playerId: IDS[0], providerPlayerId: "1000", officialMatchRating: 8.8, minutesPlayed: 90, settlementStatus: "final" },
      { playerId: IDS[1], providerPlayerId: "1001", officialMatchRating: 9.2, minutesPlayed: 84, settlementStatus: "final" },
    ],
  });
  assert.equal(winner?.card.id, "1001");
  assert.equal(winner?.card.matchRating, 9.2);
  assert.equal(winner?.totalRating, 16.53);
});

test("final Gameweek requires every fixture finished and at least one final settlement per fixture", () => {
  const fixtures = [
    { id: IDS[0], status: "FINISHED" },
    { id: IDS[1], status: "FINISHED" },
  ];
  assert.equal(touchlineGameweekIsFinal({ fixtures, settlements: [
    { fixtureId: IDS[0], status: "final" }, { fixtureId: IDS[1], status: "final" },
  ] }), true);
  assert.equal(touchlineGameweekIsFinal({ fixtures, settlements: [
    { fixtureId: IDS[0], status: "final" },
  ] }), false);
  assert.equal(touchlineGameweekIsFinal({ fixtures: [{ ...fixtures[0], status: "LIVE" }, fixtures[1]], settlements: [
    { fixtureId: IDS[0], status: "final" }, { fixtureId: IDS[1], status: "final" },
  ] }), false);
});

test("hat-trick counts only confirmed goals and penalties for the exact player", () => {
  assert.equal(countTouchlineConfirmedHatTrickGoals([
    { playerId: "1000", kind: "goal" },
    { playerId: "1000", kind: "penalty" },
    { playerId: "1000", kind: "goal" },
    { playerId: "1000", kind: "own-goal" },
    { playerId: "1001", kind: "goal" },
  ], "1000"), 3);
});

test("hat-trick facts require exact recorded status and reject every reversal state", () => {
  const base = { playerId: "1000", type: "Goal", info: null, addition: null } as const;
  assert.deepEqual(touchlineConfirmedHatTrickGoalFact({ ...base, status: "recorded" }), {
    playerId: "1000", kind: "goal",
  });
  assert.deepEqual(touchlineConfirmedHatTrickGoalFact({ ...base, type: "Penalty", status: "recorded" }), {
    playerId: "1000", kind: "penalty",
  });
  for (const status of ["rescinded", "overturned", "pending", "", "unknown"]) {
    assert.equal(touchlineConfirmedHatTrickGoalFact({ ...base, status }), null);
  }
  assert.equal(touchlineConfirmedHatTrickGoalFact({ ...base, status: "recorded", info: "VAR review" }), null);
  assert.equal(touchlineConfirmedHatTrickGoalFact({ ...base, type: "Own Goal", status: "recorded" }), null);
});

test("044 copy is British English, provisional when open and source-neutral", () => {
  const cards = [
    { name: "Bruno Fernandes", clubName: "Manchester United", totalRating: 17.16, rank: 1 },
    { name: "Rayan Cherki", clubName: "Manchester City", totalRating: 16.53, rank: 2 },
    { name: "João Pedro", clubName: "Chelsea", totalRating: 16.45, rank: 3 },
  ];
  const result = buildTouchlineRankingFamilyCaption({
    contentType: "GAMEWEEK_RANKING_PREVIEW", gameweekNumber: 2, cards,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.caption, /Current Top 3/);
    assert.match(result.caption, /Gameweek is still open/);
    assert.match(result.caption, /Total Rating 17\.16/);
    assert.doesNotMatch(result.caption, /sportmonks|\bapi\b|provider|pipeline|settlement/i);
  }
});

test("semantic ranking checksum ignores observation timestamps but not rankings", () => {
  const base = { contentType: "GAMEWEEK_RANKING_PREVIEW", scopeId: "244001", firstObservedAt: "2026-08-31T10:00:00Z", cards: [{ id: "1000", totalRating: 17.16 }] };
  assert.equal(checksumTouchlineRankingFamilyRenderSource(base), checksumTouchlineRankingFamilyRenderSource({
    ...base, firstObservedAt: "2026-08-31T10:02:00Z", sourceSnapshotAt: "2026-08-31T10:02:00Z",
  }));
  assert.notEqual(checksumTouchlineRankingFamilyRenderSource(base), checksumTouchlineRankingFamilyRenderSource({
    ...base, cards: [{ id: "1000", totalRating: 17.17 }],
  }));
});
