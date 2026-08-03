import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_POSITION_RANKING_GROUPS,
  buildTouchlineRankingSnapshot,
  type TouchlineRankingPlayerInput,
} from "../lib/touchlineArena/card-ranking.ts";
import {
  TOUCHLINE_ENGLAND_LEAGUE_KEY,
  TOUCHLINE_PRESEASON_RANKING_STATE,
  parseTouchlineActiveRankingState,
  resolveTouchlineCardCompetition,
  type TouchlineActiveRankingState,
} from "../lib/touchlineArena/card-ranking-live.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION, touchlineArenaTierForKey } from "../lib/touchlineArena/card-rules.ts";

const POSITION_GROUP_SIZES = [64, 110, 90, 120, 100, 100] as const;
const POSITION_CODES = ["GK", "CB", "RB", "CM", "RW", "ST"] as const;

function buildFullLeaguePlayers(): TouchlineRankingPlayerInput[] {
  let providerPlayerId = 10_000;
  return POSITION_GROUP_SIZES.flatMap((groupSize, groupIndex) => (
    Array.from({ length: groupSize }, (_, index) => {
      providerPlayerId += 1;
      return {
        playerId: `player-${providerPlayerId}`,
        providerPlayerId,
        name: `Player ${providerPlayerId}`,
        clubName: `Club ${(providerPlayerId % 20) + 1}`,
        position: POSITION_CODES[groupIndex],
        touchlinePoints: groupSize - index,
        minutesPlayed: 900 - index,
        appearances: 10,
      };
    })
  ));
}

function activeState(): TouchlineActiveRankingState {
  const snapshot = buildTouchlineRankingSnapshot({
    snapshotId: "england-round-01-v1",
    roundId: "round-01",
    status: "published",
    generatedAt: "2026-08-15T18:00:00.000Z",
    source: "sportmonks-audited",
    players: buildFullLeaguePlayers(),
  });

  return {
    phase: "ranked",
    leagueKey: TOUCHLINE_ENGLAND_LEAGUE_KEY,
    snapshotId: snapshot.snapshotId,
    roundId: snapshot.roundId,
    publishedAt: "2026-08-15T18:05:00.000Z",
    priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    players: snapshot.players,
  };
}

test("simulates 584 synthetic ranking records without duplicates or missing positional groups", () => {
  const state = parseTouchlineActiveRankingState(activeState());
  assert.ok(state);
  assert.equal(state.players.length, 584);
  assert.equal(new Set(state.players.map((player) => player.playerId)).size, 584);
  assert.equal(new Set(state.players.map((player) => String(player.providerPlayerId))).size, 584);
  assert.deepEqual(new Set(state.players.map((player) => player.positionGroup)), new Set(TOUCHLINE_POSITION_RANKING_GROUPS));
  assert.equal(state.players.filter((player) => player.tierKey === "diamond-gold").length, 6);

  for (const player of state.players) {
    assert.equal(player.priceTc, touchlineArenaTierForKey(player.tierKey)?.retailPriceTc);
  }
});

test("every card resolves its tier and TC price from the same published snapshot", () => {
  const state = activeState();
  const rankedPlayer = state.players.find((player) => player.positionGroup === "striker" && player.positionRank === 1)!;
  const resolved = resolveTouchlineCardCompetition({
    state,
    playerId: rankedPlayer.playerId,
    providerPlayerId: rankedPlayer.providerPlayerId,
  });

  assert.equal(resolved.ranked, true);
  assert.equal(resolved.snapshotId, state.snapshotId);
  assert.equal(resolved.tierKey, "diamond-gold");
  assert.equal(resolved.priceTc, 15);
  assert.equal(resolved.touchlinePoints, rankedPlayer.touchlinePoints);
});

test("an unknown card never borrows another player's rank", () => {
  const resolved = resolveTouchlineCardCompetition({
    state: activeState(),
    playerId: "not-in-the-published-round",
    providerPlayerId: "not-a-provider-id",
  });

  assert.equal(resolved.phase, "ranked");
  assert.equal(resolved.ranked, false);
  assert.equal(resolved.tierKey, "ruby-red");
  assert.equal(resolved.priceTc, 0);
  assert.equal(resolved.touchlinePoints, 0);
});

test("without a valid publication ranking has no economic charge", () => {
  const resolved = resolveTouchlineCardCompetition({
    state: TOUCHLINE_PRESEASON_RANKING_STATE,
    playerId: "any-player",
    providerPlayerId: 123,
  });

  assert.equal(resolved.phase, "preseason");
  assert.equal(resolved.ranked, false);
  assert.equal(resolved.tierKey, "ruby-red");
  assert.equal(resolved.priceTc, 0);
  assert.equal(resolved.touchlinePoints, 0);
});

test("rejects a published snapshot when a tier price has been altered", () => {
  const state = activeState();
  const tampered = {
    ...state,
    players: state.players.map((player, index) => index === 0 ? { ...player, priceTc: 999 } : player),
  };

  assert.equal(parseTouchlineActiveRankingState(tampered), null);
});

test("rejects invalid groups, duplicate ranks and inconsistent group sizes", () => {
  const state = activeState();
  const invalidGroup = {
    ...state,
    players: state.players.map((player, index) => index === 0
      ? { ...player, positionGroup: "unknown-position" }
      : player),
  };
  const duplicateRank = {
    ...state,
    players: state.players.map((player, index) => index === 1
      ? { ...player, positionRank: state.players[0].positionRank }
      : player),
  };
  const inconsistentSize = {
    ...state,
    players: state.players.map((player, index) => index === 0
      ? { ...player, groupSize: player.groupSize + 1 }
      : player),
  };

  assert.equal(parseTouchlineActiveRankingState(invalidGroup), null);
  assert.equal(parseTouchlineActiveRankingState(duplicateRank), null);
  assert.equal(parseTouchlineActiveRankingState(inconsistentSize), null);
});
