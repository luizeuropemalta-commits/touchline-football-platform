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

test("Market Transfer uses centralized position eligibility on gallery cards and checkout action", () => {
  const squadBuilder = readFileSync(new URL("../components/touchline/market/TouchlineSquadBuilderStage.tsx", import.meta.url), "utf8");
  assert.match(squadBuilder, /isTouchlineTacticalSlotCandidateEligible/);
  assert.match(squadBuilder, /const steps = \[/);
  assert.match(squadBuilder, /className=\{styles\.progress\}/);
});

test("Market Transfer keeps the buying workspace visible on Safari/mobile landscape", () => {
  const squadBuilderStyles = readFileSync(new URL("../components/touchline/market/TouchlineSquadBuilderStage.module.css", import.meta.url), "utf8");
  assert.match(squadBuilderStyles, /max-height: 480px\) and \(orientation: landscape\)/);
  assert.match(squadBuilderStyles, /\.workspace \{ grid-template-columns: 1fr; \}/);
  assert.match(squadBuilderStyles, /\.pitch \{ min-height: 0; border-right:/);
});
