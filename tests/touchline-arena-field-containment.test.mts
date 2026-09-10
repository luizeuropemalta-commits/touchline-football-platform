import assert from "node:assert/strict";
import test from "node:test";

import { ARENA_PERSPECTIVE_CALIBRATIONS, hasFourLineGrassPolygon } from "../lib/touchlineArena/arena-perspective-calibration.ts";
import { containArenaFieldCard, type ArenaFieldSlot } from "../lib/touchlineArena/arena-field-containment.ts";

const stage = { width: 1440, height: 900, viewportHeight: 900, stageTop: 0, carouselTop: 804 } as const;

function pointIsInsideMeasuredConvexPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]) {
  return polygon.every((current, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    const cross = (next.x - current.x) * (point.y - current.y) - (next.y - current.y) * (point.x - current.x);
    return cross >= -0.01;
  });
}
function project(point: { x: number; y: number }) {
  const scale = Math.max(stage.width / 1280, stage.height / 720);
  return { x: point.x * scale - ((1280 * scale - stage.width) / 2), y: point.y * scale - ((720 * scale - stage.height) / 2) };
}
function assertFullEnvelopeInside(slot: ArenaFieldSlot, perspective: "wide-touchline" | "lower-stand") {
  const result = containArenaFieldCard(slot, perspective, stage);
  const calibration = ARENA_PERSPECTIVE_CALIBRATIONS[perspective];
  assert.equal(hasFourLineGrassPolygon(calibration), true);
  const polygon = calibration.grassPolygon.map(project);
  const { left, top, right, bottom } = result.envelope;
  for (const corner of [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]) {
    assert.equal(pointIsInsideMeasuredConvexPolygon(corner, polygon), true, `${perspective} must contain every card corner`);
  }
  assert.equal(result.coverage, "four-line-polygon");
}

const supportedFormationSamples: readonly ArenaFieldSlot[] = [
  { x: 16, y: 69, heightVh: 9.2 }, { x: 32.4, y: 42, heightVh: 9.2 }, { x: 35, y: 59.3, heightVh: 9.2 }, { x: 35, y: 73.1, heightVh: 9.2 }, { x: 32.4, y: 92, heightVh: 9.2 },
  { x: 50.6, y: 52.8, heightVh: 9.2 }, { x: 51, y: 69, heightVh: 9.2 }, { x: 52.8, y: 85.2, heightVh: 9.2 },
  { x: 67.4, y: 50.1, heightVh: 9.2 }, { x: 72.8, y: 68.5, heightVh: 9.2 }, { x: 67.4, y: 87.5, heightVh: 9.2 },
  { x: 50.4, y: 48.5, heightVh: 9.2 }, { x: 51, y: 61.5, heightVh: 9.2 }, { x: 51.9, y: 76.6, heightVh: 9.2 }, { x: 50.4, y: 89.5, heightVh: 9.2 },
  { x: 70.1, y: 62.5, heightVh: 9.2 }, { x: 70.1, y: 75.5, heightVh: 9.2 },
];

test("wide and lower contain the full card envelope for both supported formation samples", () => {
  for (const perspective of ["wide-touchline", "lower-stand"] as const) for (const slot of supportedFormationSamples) assertFullEnvelopeInside(slot, perspective);
});
test("side-sweep is rail-only and clamps the full card bottom above the live carousel rail", () => {
  for (const slot of supportedFormationSamples) {
    const result = containArenaFieldCard({ ...slot, y: 94 }, "side-sweep", stage);
    assert.equal(result.coverage, "rail-only");
    assert.ok(result.envelope.bottom <= 800);
  }
  assert.equal(hasFourLineGrassPolygon(ARENA_PERSPECTIVE_CALIBRATIONS["side-sweep"]), false);
});
test("side-sweep does not invent a polygon when the live rail cannot be measured", () => {
  const result = containArenaFieldCard({ x: 75, y: 94, heightVh: 9.2 }, "side-sweep", { ...stage, carouselTop: null });
  assert.equal(result.coverage, "unmeasured");
});
