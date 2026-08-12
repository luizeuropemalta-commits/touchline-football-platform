import assert from "node:assert/strict";
import test from "node:test";
import { resolveTouchlineMarketCataloguePosition } from "../lib/touchlineArena/market-position-catalogue.ts";
import { touchlineMarketPositionBucket } from "../lib/touchlineArena/position-eligibility.ts";

test("the 20-club Market catalogue restores broad Defender rows to their real full-back filter", () => {
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("8456257", "Defender"), "defender"), "right-back");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("7026573", "Defender"), "defender"), "right-back");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("32777506", "Defender"), "defender"), "left-back");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("164061", "Defender"), "defender"), "right-back");
  assert.equal(touchlineMarketPositionBucket(resolveTouchlineMarketCataloguePosition("955", "Defender"), "defender"), "left-back");
});

test("the catalogue never reclassifies an unknown player", () => {
  assert.equal(resolveTouchlineMarketCataloguePosition("333731", "Defender"), "Defender");
});
