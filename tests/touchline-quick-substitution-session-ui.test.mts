import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const substitutionMarkSource = readFileSync(
  new URL("../components/touchline/TouchlineSubstitutionMark.tsx", import.meta.url),
  "utf8",
);
const substitutionMarkStyles = readFileSync(
  new URL("../components/touchline/TouchlineSubstitutionMark.module.css", import.meta.url),
  "utf8",
);

test("the shared substitution mark stays transparent with independent live green and red neon", () => {
  assert.match(substitutionMarkSource, /className=\{styles\.incoming\}/);
  assert.match(substitutionMarkSource, /className=\{styles\.outgoing\}/);
  assert.match(substitutionMarkStyles, /\.mark\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(substitutionMarkStyles, /\.incoming\s*\{[\s\S]*?stroke:\s*#a9ff2e[\s\S]*?drop-shadow/);
  assert.match(substitutionMarkStyles, /\.outgoing\s*\{[\s\S]*?stroke:\s*#ff4354[\s\S]*?drop-shadow/);
  assert.match(substitutionMarkStyles, /@keyframes touchline-incoming-neon/);
  assert.match(substitutionMarkStyles, /@keyframes touchline-outgoing-neon/);
  assert.match(substitutionMarkStyles, /@media \(prefers-reduced-motion: reduce\)/);
});
