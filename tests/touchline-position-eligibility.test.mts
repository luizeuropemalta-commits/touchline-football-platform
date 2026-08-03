import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_MARKET_POSITION_LIMITS,
  touchlineMarketPositionBucket,
  touchlineMarketPositionBucketCount,
  touchlineMarketPositionBucketLabel,
  touchlineMarketPositionProgress,
  touchlineTwoStrikerFormationHint,
} from "../lib/touchlineArena/position-eligibility.ts";

test("maps real football positions beyond broad GK DEF MID FWD filters", () => {
  assert.equal(touchlineMarketPositionBucket("ST", "forward"), "striker");
  assert.equal(touchlineMarketPositionBucket("CF", "forward"), "striker");
  assert.equal(touchlineMarketPositionBucket("Centroavante", "forward"), "striker");
  assert.equal(touchlineMarketPositionBucket("CDM", "midfielder"), "defensive-midfield");
  assert.equal(touchlineMarketPositionBucket("Volante", "midfielder"), "defensive-midfield");
  assert.equal(touchlineMarketPositionBucket("CAM", "midfielder"), "attacking-midfield");
  assert.equal(touchlineMarketPositionBucket("LW", "forward"), "winger");
  assert.equal(touchlineMarketPositionBucket("RB", "defender"), "full-back");
  assert.equal(touchlineMarketPositionBucket("CB", "defender"), "centre-back");
});

test("enforces Reality roster limits before a ClubOwner buys unusable cards", () => {
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS.striker, 2);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS["defensive-midfield"], 3);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS.goalkeeper, 3);

  const counts = touchlineMarketPositionBucketCount([
    { position: "ST", role: "forward" },
    { position: "CF", role: "forward" },
    { position: "CDM", role: "midfielder" },
    { position: "Volante", role: "midfielder" },
    { position: "Defensive Midfielder", role: "midfielder" },
  ]);

  assert.equal(counts.striker, 2);
  assert.equal(counts["defensive-midfield"], 3);
});

test("derives one reusable progress view without altering approved position limits", () => {
  const progress = touchlineMarketPositionProgress({
    striker: 2,
    "defensive-midfield": 2,
  });

  assert.deepEqual(progress.find((entry) => entry.bucket === "striker"), {
    bucket: "striker",
    count: 2,
    limit: 2,
    isFull: true,
  });
  assert.deepEqual(progress.find((entry) => entry.bucket === "defensive-midfield"), {
    bucket: "defensive-midfield",
    count: 2,
    limit: 3,
    isFull: false,
  });
});

test("shows football language for Portuguese and English buyers", () => {
  assert.equal(touchlineMarketPositionBucketLabel("striker", "pt-BR"), "Centroavante / ST");
  assert.equal(touchlineMarketPositionBucketLabel("defensive-midfield", "pt-BR"), "Volante / CDM");
  assert.equal(touchlineMarketPositionBucketLabel("striker", "en-GB"), "Centre-forward / ST");
  assert.match(touchlineTwoStrikerFormationHint("pt-BR"), /4-4-2/);
});

test("Market Transfer uses centralized position eligibility on list, preview and checkout action", () => {
  const source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

  assert.match(source, /touchlineMarketPositionBucketCount/);
  assert.match(source, /touchlineMarketPositionProgress/);
  assert.match(source, /marketNeedsOnly/);
  assert.match(source, /team-builder-club-progress/);
  assert.match(source, /isPositionLimitReached/);
  assert.match(source, /selectedBuilderPositionIsFull/);
  assert.match(source, /marketUi\.positionLimitReached/);
  assert.match(source, /touchlineTwoStrikerFormationHint/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.arena-action-panel-market \{/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.arena-action-panel-market \{[\s\S]*?overflow: visible;/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.arena-action-panel-market \.team-builder-preview \{[\s\S]*?position: sticky;/);
  assert.match(source, /\.arena-action-panel-market \.team-builder-send \{[\s\S]*?position: sticky;/);
});

test("Market Transfer keeps the buying workspace visible on Safari/mobile landscape", () => {
  const source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");

  assert.match(source, /Market Transfer — short landscape\/mobile audit pass/);
  assert.match(source, /max-width: 940px\) and \(max-height: 540px\)/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-deal-flow \{[\s\S]*?display: none;/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-bank \{[\s\S]*?display: none;/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-board \{[\s\S]*?"clubs clubs"[\s\S]*?"roster preview"/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-preview \{[\s\S]*?position: sticky;[\s\S]*?max-height: calc\(100svh - 14px\);/);
});
