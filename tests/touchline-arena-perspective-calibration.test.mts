import assert from "node:assert/strict";
import test from "node:test";

import {
  ARENA_PERSPECTIVE_CALIBRATION_REVISION,
  ARENA_PERSPECTIVE_CALIBRATIONS,
  hasFourLineGrassPolygon,
} from "../lib/touchlineArena/arena-perspective-calibration.ts";

test("keeps a measured four-line grass polygon for every filmed Arena perspective", () => {
  assert.equal(ARENA_PERSPECTIVE_CALIBRATION_REVISION, "2026-09-10.v2");

  const wide = ARENA_PERSPECTIVE_CALIBRATIONS["wide-touchline"];
  const lower = ARENA_PERSPECTIVE_CALIBRATIONS["lower-stand"];
  const sideSweep = ARENA_PERSPECTIVE_CALIBRATIONS["side-sweep"];

  assert.equal(hasFourLineGrassPolygon(wide), true);
  assert.equal(hasFourLineGrassPolygon(lower), true);
  assert.equal(hasFourLineGrassPolygon(sideSweep), true);
  assert.equal(sideSweep.coverage, "four-line-polygon");
  assert.deepEqual(sideSweep.loopWindowSeconds, { startSeconds: 14.7, endSeconds: 21.025 });
  assert.equal(sideSweep.grassPolygon.length, 4);
});
