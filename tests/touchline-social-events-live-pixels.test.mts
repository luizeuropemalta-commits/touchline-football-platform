import assert from "node:assert/strict";
import test from "node:test";
import { assessEventsLiveSeam, compareEventsLivePixels } from "../lib/touchlineArena/social-events-live-media-evidence.ts";

const width = 1080, height = 1350;
const base = new Uint8Array(width * height * 3).fill(32);
const compare = (pixels: Uint8Array) => compareEventsLivePixels(base, pixels, width, height);
const unchanged = () => compare(base);
const noisy = (count: number, delta: number) => {
  const pixels = base.slice();
  for (let index = 0; index < count; index++) pixels[index * 3] = 32 + delta;
  return compare(pixels);
};
const movement = noisy(20000, 64);
const joins = { start: "source-a", mid: "source-b", end: "source-a-raster-2", "second-mid": "source-b-raster-2", "second-loop": "source-a-raster-3" };
const geometry = Object.fromEntries(Object.keys(joins).map(phase => [phase, [{ x: 64, y: 777.0625, width: 456, height: 170 }]]));
const evidence = () => ({ firstSeam: unchanged(), secondSeam: unchanged(), repeatedMid: unchanged(), motion: movement });

test("RGB comparison counts pixels, not PNG compression bytes, with independently calculated metrics", () => {
  const result = compareEventsLivePixels(new Uint8Array([0, 10, 20, 100, 100, 100]), new Uint8Array([0, 13, 16, 100, 100, 100]), 2, 1);
  assert.equal(result.changedPixels, 1);
  assert.equal(result.changedFraction, 0.5);
  assert.equal(result.maximumChannelError, 4);
  assert.equal(result.meanAbsoluteError, 7 / 6);
  assert.deepEqual(result.bounds, { left: 0, top: 0, right: 0, bottom: 0 });
  assert.throws(() => compareEventsLivePixels(base, base.slice(3), width, height), /RGB_DIMENSIONS_REQUIRED/);
});
test("sparse low-energy rasterization variance can pass, while exact hashes remain factual", () => {
  const lowEnergy = base.slice();
  // 45 pixels, total absolute error 171, max 9: independently matches the failed job's energy.
  lowEnergy[0] = 41;
  for (let pixel = 1; pixel <= 30; pixel++) lowEnergy[pixel * 3] = 36;
  for (let pixel = 31; pixel <= 44; pixel++) lowEnergy[pixel * 3] = 35;
  const delta = compare(lowEnergy);
  assert.equal(delta.changedPixels, 45);
  assert.equal(delta.meanAbsoluteError, 171 / base.length);
  const result = assessEventsLiveSeam(joins, geometry, { ...evidence(), firstSeam: delta, secondSeam: delta, repeatedMid: delta });
  assert.equal(result.passed, true);
  assert.equal(result.exactChecks.firstSeamPixelsEqual, false, "never falsify exact equality");
});
test("seam rejects high-contrast defects, diffuse noise, excessive energy, geometric drift and missing evidence", () => {
  for (const delta of [noisy(1, 11), noisy(65, 1), noisy(64, 4), movement]) {
    assert.equal(assessEventsLiveSeam(joins, geometry, { ...evidence(), firstSeam: delta }).passed, false);
  }
  const drift = structuredClone(geometry); drift.end![0]!.x += 0.001;
  assert.equal(assessEventsLiveSeam(joins, drift, evidence()).passed, false);
  const midDrift = structuredClone(geometry); midDrift["second-mid"]![0]!.y += 0.001;
  assert.equal(assessEventsLiveSeam(joins, midDrift, evidence()).passed, false);
  assert.equal(assessEventsLiveSeam(joins, geometry).passed, false);
});
test("static exports and raster noise alone never satisfy motion", () => {
  for (const motion of [unchanged(), noisy(45, 3)]) {
    assert.equal(assessEventsLiveSeam(joins, geometry, { ...evidence(), motion }).checks.motionPresent, false);
  }
});
