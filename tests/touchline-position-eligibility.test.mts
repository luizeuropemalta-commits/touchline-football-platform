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

test("Market Transfer uses canonical slot eligibility and validates player replacement", () => {
  const squadBuilder = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.match(squadBuilder, /touchlineFantasySlotAcceptsPlayer\(activeSlot, player\)/);
  assert.match(squadBuilder, /replaceTouchlineFantasyPlayerAtSlot\(\{ selections, slot, player \}\)/);
  assert.match(squadBuilder, /validateTouchlineFantasyLineup\(\{ selections: next/);
});

test("Market mobile styles retain unscaled pitch controls and minimum touch targets", () => {
  const squadBuilderStyles = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  const marketMobile = squadBuilderStyles.slice(squadBuilderStyles.indexOf("/* The Market picker must remain reachable"));
  assert.match(marketMobile, /@media \(max-width: 900px\)/);
  assert.match(marketMobile, /\.myClubTacticalPitch\s*\{\s*width: 100%;\s*transform: none;/);
  // The owner replaced the generic swap button with a red X and an empty-slot +.
  // Both current controls must retain the original minimum touch target.
  const removeRule = marketMobile.match(/\.myClubPitchViewport \.myClubTacticalSlot > \.pitchRemove\s*\{([^}]*)\}/)?.[1] ?? "";
  const emptyRule = marketMobile.match(/\.emptyPosition\s*\{([^}]*)\}/)?.[1] ?? "";
  for (const rule of [removeRule, emptyRule]) {
    assert.match(rule, /display: grid;/);
    assert.match(rule, /(?:^|;)\s*width: 44px;/);
    assert.match(rule, /(?:^|;)\s*height: 44px;/);
  }
  assert.match(removeRule, /min-height: 44px;/);
});
