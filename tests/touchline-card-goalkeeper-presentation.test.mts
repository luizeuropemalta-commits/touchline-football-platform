import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cardSource = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

test("the official card consumes the pure goalkeeper stat presentation contract", () => {
  assert.match(cardSource, /buildTouchlineCardStatPresentation/);
  assert.match(cardSource, /saves:\s*"statDef"/);
  assert.match(cardSource, /label=\{stat\.label\}/);
  assert.match(cardSource, /icon === "glove"/);
  assert.match(cardSource, /GoalkeeperGloveStatIcon/);
});

test("the goalkeeper saves slot reuses the existing defensive stat position", () => {
  assert.match(cardSource, /saves:\s*"statDef"/);
  assert.match(cardSource, /stat\.valueState === "available"[\s\S]{0,160}?: preseasonMissingValue/);
});
