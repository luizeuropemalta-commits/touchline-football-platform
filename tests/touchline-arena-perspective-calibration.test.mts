import assert from "node:assert/strict";
import test from "node:test";

import {
  ARENA_PERSPECTIVE_CALIBRATION_REVISION,
  ARENA_PERSPECTIVE_CALIBRATIONS,
  calculateSideSweepBottomSafeY,
  cardEnvelopeClearsSideSweepRail,
  hasFourLineGrassPolygon,
} from "../lib/touchlineArena/arena-perspective-calibration.ts";

test("keeps the measured four-line polygons scoped to wide and lower perspectives", () => {
  assert.equal(ARENA_PERSPECTIVE_CALIBRATION_REVISION, "2026-09-10.v1");

  const wide = ARENA_PERSPECTIVE_CALIBRATIONS["wide-touchline"];
  const lower = ARENA_PERSPECTIVE_CALIBRATIONS["lower-stand"];
  const sideSweep = ARENA_PERSPECTIVE_CALIBRATIONS["side-sweep"];

  assert.equal(hasFourLineGrassPolygon(wide), true);
  assert.equal(hasFourLineGrassPolygon(lower), true);
  assert.equal(hasFourLineGrassPolygon(sideSweep), false);
  assert.equal(sideSweep.coverage, "rail-only");
  assert.equal("grassPolygon" in sideSweep, false);
});

test("derives the side-sweep boundary from the live rail measurement, not an anchor point", () => {
  const sideSweep = ARENA_PERSPECTIVE_CALIBRATIONS["side-sweep"];
  assert.equal(sideSweep.coverage, "rail-only");
  assert.equal(calculateSideSweepBottomSafeY(sideSweep.railMeasurement), 800);

  assert.equal(cardEnvelopeClearsSideSweepRail({
    left: 984.8,
    top: 680.41,
    right: 1054.23,
    bottom: 792,
  }, sideSweep.railMeasurement), true);

  assert.equal(cardEnvelopeClearsSideSweepRail({
    left: 984.8,
    top: 680.41,
    right: 1054.23,
    bottom: 800.01,
  }, sideSweep.railMeasurement), false);
});

test("rejects malformed full-card envelopes rather than treating a tactical point as safe", () => {
  const sideSweep = ARENA_PERSPECTIVE_CALIBRATIONS["side-sweep"];

  assert.equal(cardEnvelopeClearsSideSweepRail({
    left: 40,
    top: 200,
    right: 20,
    bottom: 300,
  }, sideSweep.railMeasurement), false);
});
