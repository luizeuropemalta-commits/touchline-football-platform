import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
  parseTouchlineActiveRankingState,
  touchlinePlayerCrownEligibility,
  type TouchlineActiveRankingState,
} from "../lib/touchlineArena/card-ranking-live.ts";
import {
  TOUCHLINE_CARD_PRICE_TABLE_VERSION,
  touchlineArenaTierForKey,
} from "../lib/touchlineArena/card-rules.ts";
import { TOUCHLINE_POSITION_RANKING_GROUPS } from "../lib/touchlineArena/card-ranking.ts";
import { touchlinePlayerLeadershipScope } from "../lib/touchlineArena/player-ranking-leadership.ts";

const snapshotId = "qa-v3-snapshot";
const players = TOUCHLINE_POSITION_RANKING_GROUPS.map((positionGroup, index) => ({
  playerId: `touchline-player-${index + 1}`,
  providerPlayerId: `provider-${index + 1}`,
  positionGroup,
  positionRank: 1,
  groupSize: 1,
  totalRating: 8 + index / 10,
  tierKey: "diamond-gold" as const,
  priceTc: touchlineArenaTierForKey("diamond-gold")!.retailPriceTc,
}));

function state(decision?: unknown): TouchlineActiveRankingState {
  return {
    phase: "ranked",
    leagueKey: TOUCHLINE_ENGLAND_LEAGUE_KEY,
    snapshotId,
    roundId: "qa-round-1",
    publishedAt: "2026-09-10T09:01:00.000Z",
    priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    scoringVersion: "player_scoring_v3",
    coverageStatus: "complete",
    seasonId: "qa-season-1",
    fixtureIds: ["fixture-1"],
    expectedFixtureIds: ["fixture-1"],
    totalScorePoints: 0,
    players,
    leadershipDecision: decision as never,
  };
}

test("only one explicitly published overall v3 leader receives a crown", () => {
  const active = parseTouchlineActiveRankingState(state({
    status: "unique-leader",
    scope: touchlinePlayerLeadershipScope(snapshotId),
    leader: { subjectType: "player", subjectId: players[0]!.playerId },
  }));

  assert.ok(active);
  assert.equal(touchlinePlayerCrownEligibility({ state: active, playerId: players[0]!.playerId }), true);
  assert.equal(touchlinePlayerCrownEligibility({ state: active, playerId: players[1]!.playerId }), false);
});

test("ties, missing metadata and wrong scope fail closed without rejecting v3 coverage", () => {
  const noDecision = parseTouchlineActiveRankingState(state());
  const tied = parseTouchlineActiveRankingState(state({
    status: "tied",
    scope: touchlinePlayerLeadershipScope(snapshotId),
    contenders: players.slice(0, 2).map((player) => ({ subjectType: "player" as const, subjectId: player.playerId })),
  }));
  const wrongScope = parseTouchlineActiveRankingState(state({
    status: "unique-leader",
    scope: touchlinePlayerLeadershipScope("other-v3-snapshot"),
    leader: { subjectType: "player", subjectId: players[0]!.playerId },
  }));

  assert.ok(noDecision && tied && wrongScope);
  assert.equal(touchlinePlayerCrownEligibility({ state: noDecision, playerId: players[0]!.playerId }), false);
  assert.equal(touchlinePlayerCrownEligibility({ state: tied, playerId: players[0]!.playerId }), false);
  assert.equal(touchlinePlayerCrownEligibility({ state: wrongScope, playerId: players[0]!.playerId }), false);
  assert.equal(wrongScope.phase, "ranked");
});
