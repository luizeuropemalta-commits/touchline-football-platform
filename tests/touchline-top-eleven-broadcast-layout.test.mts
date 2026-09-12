import assert from "node:assert/strict";
import test from "node:test";
import {
  TOUCHLINE_TOP_ELEVEN_BROADCAST_POINTS,
  touchlineTopElevenBroadcastPoint,
} from "../lib/touchlineArena/top-eleven-broadcast-layout.ts";

test("Best XI broadcast points keep every published role inside the landscape pitch", () => {
  const points = Object.entries(TOUCHLINE_TOP_ELEVEN_BROADCAST_POINTS);
  assert.equal(points.length, 11);
  for (const [id, point] of points) {
    assert.ok(point.x >= 10 && point.x <= 90, `${id} x stays inside the pitch`);
    assert.ok(point.y >= 12 && point.y <= 88, `${id} y stays inside the pitch`);
  }
});

test("Best XI broadcast rows reserve vertical clearance for compact card envelopes", () => {
  for (const ids of [["lb", "lcb", "rcb", "rb"], ["lcm", "cm", "rcm"], ["lw", "st", "rw"]]) {
    const ordered = ids.map((id) => TOUCHLINE_TOP_ELEVEN_BROADCAST_POINTS[id]!).map((point) => point.y);
    for (let index = 1; index < ordered.length; index += 1) {
      assert.ok(ordered[index]! - ordered[index - 1]! >= 20, `${ids[index - 1]} and ${ids[index]} do not overlap`);
    }
  }
});

test("unknown public roles fail closed instead of being placed over another card", () => {
  assert.equal(touchlineTopElevenBroadcastPoint({ id: "unknown" }), null);
});
