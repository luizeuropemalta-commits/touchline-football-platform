import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("profile identity rows share one readable separator regardless of highlighted content", () => {
  const css = readFileSync(new URL("../components/touchline/cards/TouchlineCardZoom.module.css", import.meta.url), "utf8");
  const rows = css.match(/\.identityGrid > div\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(rows, /border-bottom: 1px solid rgba\(158, 255, 45, \.32\)/);
  assert.doesNotMatch(css, /\.identityGrid \.detailAccent\s*\{[^}]*border-color:/);
});
