import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  normalizeTouchLineShirtNumber,
  TOUCHLINE_DIGIT_MARK_ANCHORS,
  TOUCHLINE_SHIRT_DIGIT_ASSETS,
  TOUCHLINE_SHIRT_DIGIT_IMAGE_BOXES,
} from "../lib/touchlineArena/shirt-number-art.ts";

test("TouchLine shirt art defines every decimal digit", () => {
  const digits = Object.keys(TOUCHLINE_SHIRT_DIGIT_ASSETS).sort();
  assert.deepEqual(digits, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
});

test("every approved digit asset exists in the public number library", () => {
  for (const [digit, asset] of Object.entries(TOUCHLINE_SHIRT_DIGIT_ASSETS)) {
    assert.equal(asset, `/touchlineArena/shared/shirt-number-digits/${digit}.png`);
    assert.ok(
      existsSync(path.join(process.cwd(), "public", asset)),
      `${digit} approved digit asset is missing`,
    );
  }
});

test("every digit uses one normalized shirt height and remains inside the canvas", () => {
  for (const [digit, box] of Object.entries(TOUCHLINE_SHIRT_DIGIT_IMAGE_BOXES)) {
    assert.equal(box.y, 0, `${digit} must start at the official shirt-number top`);
    assert.equal(box.height, 100, `${digit} must use the same official shirt-number height`);
    assert.ok(box.x >= 0, `${digit} starts outside the digit canvas`);
    assert.ok(box.width > 0 && box.x + box.width <= 70.01, `${digit} exceeds the digit canvas`);
  }

  assert.deepEqual(
    TOUCHLINE_SHIRT_DIGIT_IMAGE_BOXES["0"],
    { x: 0, y: 0, width: 70, height: 100 },
    "zero must no longer render shorter than its neighbouring digit",
  );
});

test("each digit owns a safe, visible TL cutout anchor", () => {
  for (const [digit, anchor] of Object.entries(TOUCHLINE_DIGIT_MARK_ANCHORS)) {
    assert.ok(anchor.x > 0 && anchor.x < 70, `${digit} x anchor is outside the digit canvas`);
    assert.ok(anchor.y >= 88 && anchor.y < 100, `${digit} mark is not in the approved lower band`);
    assert.ok(anchor.scale > 0 && anchor.scale < 0.2, `${digit} mark scale is unsafe`);
  }
});

test("production anchors preserve the approved lower positions", () => {
  const expectedPositions = {
    "0": [36, 89.3],
    "1": [40.8, 88],
    "2": [37.1, 88.1],
    "3": [40.2, 89.3],
    "4": [48.5, 88.6],
    "5": [37.9, 89.9],
    "6": [38.9, 89.8],
    "7": [29, 88.3],
    "8": [35.9, 90.3],
    "9": [37.1, 89.7],
  } as const;

  for (const [digit, [x, y]] of Object.entries(expectedPositions)) {
    assert.deepEqual(
      [TOUCHLINE_DIGIT_MARK_ANCHORS[digit as keyof typeof expectedPositions].x,
        TOUCHLINE_DIGIT_MARK_ANCHORS[digit as keyof typeof expectedPositions].y],
      [x, y],
    );
  }
});

test("shirt numbers are limited to two numeric digits", () => {
  assert.equal(normalizeTouchLineShirtNumber("10"), "10");
  assert.equal(normalizeTouchLineShirtNumber(" #27 "), "27");
  assert.equal(normalizeTouchLineShirtNumber("123"), "12");
  assert.equal(normalizeTouchLineShirtNumber(null), "");
});
