import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_MARKET_POSITION_LIMITS,
  TOUCHLINE_MARKET_POSITION_SEQUENCE,
  TOUCHLINE_MARKET_APPROVED_SQUAD_SIZE,
  touchlineMarketPositionBucket,
  touchlineMarketPositionBucketCount,
  touchlineMarketPositionBucketLabel,
  touchlineMarketPositionProgress,
  touchlineTwoStrikerFormationHint,
} from "../lib/touchlineArena/position-eligibility.ts";

test("maps real football positions beyond broad GK DEF MID FWD filters", () => {
  assert.equal(touchlineMarketPositionBucket("ST", "forward"), "centre-forward");
  assert.equal(touchlineMarketPositionBucket("CF", "forward"), "centre-forward");
  assert.equal(touchlineMarketPositionBucket("Centroavante", "forward"), "centre-forward");
  assert.equal(touchlineMarketPositionBucket("CDM", "midfielder"), "defensive-midfield");
  assert.equal(touchlineMarketPositionBucket("Volante", "midfielder"), "defensive-midfield");
  assert.equal(touchlineMarketPositionBucket("CAM", "midfielder"), "midfield");
  assert.equal(touchlineMarketPositionBucket("LW", "forward"), "attacker");
  assert.equal(touchlineMarketPositionBucket("RB", "defender"), "right-back");
  assert.equal(touchlineMarketPositionBucket("LB", "defender"), "left-back");
  assert.equal(touchlineMarketPositionBucket("CB", "defender"), "centre-back");
});

test("enforces the approved 35-player ClubOwner position limits", () => {
  assert.equal(TOUCHLINE_MARKET_APPROVED_SQUAD_SIZE, 35);
  assert.deepEqual([...TOUCHLINE_MARKET_POSITION_SEQUENCE], [
    "goalkeeper",
    "centre-back",
    "right-back",
    "left-back",
    "defensive-midfield",
    "midfield",
    "attacker",
    "centre-forward",
  ]);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS["centre-forward"], 5);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS["right-back"], 2);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS["left-back"], 2);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS["defensive-midfield"], 5);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS.goalkeeper, 3);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS["centre-back"], 6);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS.midfield, 6);
  assert.equal(TOUCHLINE_MARKET_POSITION_LIMITS.attacker, 6);

  const counts = touchlineMarketPositionBucketCount([
    { position: "ST", role: "forward" },
    { position: "CF", role: "forward" },
    { position: "CDM", role: "midfielder" },
    { position: "Volante", role: "midfielder" },
    { position: "Defensive Midfielder", role: "midfielder" },
  ]);

  assert.equal(counts["centre-forward"], 2);
  assert.equal(counts["defensive-midfield"], 3);
});

test("derives one reusable progress view without altering approved position limits", () => {
  const progress = touchlineMarketPositionProgress({
    "centre-forward": 5,
    "defensive-midfield": 2,
  });

  assert.deepEqual(progress.find((entry) => entry.bucket === "centre-forward"), {
    bucket: "centre-forward",
    count: 5,
    limit: 5,
    isFull: true,
  });
  assert.deepEqual(progress.find((entry) => entry.bucket === "defensive-midfield"), {
    bucket: "defensive-midfield",
    count: 2,
    limit: 5,
    isFull: false,
  });
});

test("shows football language for Portuguese and English buyers", () => {
  assert.equal(touchlineMarketPositionBucketLabel("centre-forward", "pt-BR"), "Centroavante / ST");
  assert.equal(touchlineMarketPositionBucketLabel("defensive-midfield", "pt-BR"), "Volante / CDM");
  assert.equal(touchlineMarketPositionBucketLabel("centre-forward", "en-GB"), "Centre-forward / ST");
  assert.match(touchlineTwoStrikerFormationHint("pt-BR"), /4-4-2/);
});

test("Market Transfer uses centralized position eligibility on list, preview and checkout action", () => {
  const source = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const squadBuilder = readFileSync(new URL("../components/touchline/market/TouchlineSquadBuilderStage.tsx", import.meta.url), "utf8");

  assert.match(source, /touchlineMarketPositionBucketCount/);
  assert.match(source, /marketNeedsOnly/);
  assert.match(source, /<TouchlineSquadBuilderStage/);
  assert.match(source, /selectedRole=\{marketPositionFilter\}/);
  assert.match(squadBuilder, /const steps = \[/);
  assert.match(squadBuilder, /className=\{styles\.progress\}/);
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
  const squadBuilderStyles = readFileSync(new URL("../components/touchline/market/TouchlineSquadBuilderStage.module.css", import.meta.url), "utf8");

  assert.match(source, /Market Transfer — short landscape\/mobile audit pass/);
  assert.match(source, /max-width: 940px\) and \(max-height: 540px\)/);
  assert.match(squadBuilderStyles, /max-height: 480px\) and \(orientation: landscape\)/);
  assert.match(squadBuilderStyles, /\.workspace \{ grid-template-columns: minmax\(0, 1\.4fr\) minmax\(230px, \.6fr\); \}/);
  assert.match(squadBuilderStyles, /\.pitch \{ min-height: 330px; \}/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.arena-action-panel-market > \.team-builder-bank \{[\s\S]*?display: grid;/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-board \{[\s\S]*?"clubs clubs"[\s\S]*?"roster preview"/);
  assert.match(source, /\.touchline-game\.is-market-standalone \.team-builder-preview \{[\s\S]*?position: sticky;[\s\S]*?max-height: calc\(100svh - 14px\);/);
});
