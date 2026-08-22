import assert from "node:assert/strict";
import test from "node:test";
import { inferArenaRole } from "../lib/football-data/arena-lineup.ts";
import { resolveTouchlineMarketCataloguePosition } from "../lib/touchlineArena/market-position-catalogue.ts";
import { touchlineMarketPositionBucket } from "../lib/touchlineArena/position-eligibility.ts";

test("the Market trusts persisted exact positions and never guesses from provider identity", () => {
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("37701999", "Right Wing"), "forward"), "attacker");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("8456257", "Right Back"), "defender"), "right-back");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("32777506", "Left Back"), "defender"), "left-back");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("any-id", "Defensive Midfield"), "midfielder"), "defensive-midfield");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("any-id", "Centre Forward"), "forward"), "centre-forward");
});

test("a missing detailed position stays pending instead of consuming a quota", () => {
  assert.equal(resolveTouchlineMarketCataloguePosition("37555035", null), null);
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("37555035", null), "forward"), "outfield");
});

test("the Arena preserves detailed back and wing roles when it reloads a saved XI", () => {
  assert.equal(inferArenaRole("Left Back"), "defender");
  assert.equal(inferArenaRole("Right Back"), "defender");
  assert.equal(inferArenaRole("Right Wing"), "forward");
});
