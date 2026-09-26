import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("card artwork stays natural without an extra focus rectangle or glow", () => {
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  const normal = css.match(/\.trigger:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(normal, /outline: none/);
  assert.match(normal, /filter: none/);
  assert.doesNotMatch(normal, /drop-shadow|border-radius|outline:.*solid/);
  assert.match(css, /@media \(forced-colors: active\)\s*\{\s*\.trigger:focus-visible\s*\{[^}]*outline: 2px solid Highlight/);
});
