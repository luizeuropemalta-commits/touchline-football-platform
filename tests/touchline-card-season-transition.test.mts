import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_CARD_CONTRACT_TERM_SEASONS,
  carryTouchlineCardIntoNextSeason,
} from "../lib/touchlineArena/card-season-transition.ts";

test("a seasonal contract preserves history but requires a fresh server quote next season", () => {
  const nextSeason = carryTouchlineCardIntoNextSeason({
    playerId: "player-20",
    seasonId: "2026-27",
    publishedSnapshotId: "ranking-2026-27-final",
  }, "2027-28");

  assert.equal(TOUCHLINE_CARD_CONTRACT_TERM_SEASONS, 1);
  assert.equal(nextSeason.contractExpiresAtSeasonEnd, true);
  assert.equal(nextSeason.requiresFreshServerMarketQuote, true);
  assert.equal(nextSeason.seasonStatsReset, true);
  assert.equal(nextSeason.careerHistoryRetained, true);
  assert.equal("startingTierKey" in nextSeason, false);
  assert.equal("startingPriceTc" in nextSeason, false);
});

test("season carry-over requires a real closing history and a distinct next season", () => {
  assert.throws(() => carryTouchlineCardIntoNextSeason({
    playerId: "player-20",
    seasonId: "2026-27",
    publishedSnapshotId: "ranking-2026-27-final",
  }, "2026-27"), /distinct next season/);

  assert.throws(() => carryTouchlineCardIntoNextSeason({
    playerId: "",
    seasonId: "2026-27",
    publishedSnapshotId: "",
  }, "2027-28"), /player and published closing snapshot/);
});
