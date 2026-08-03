import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES,
  touchlineShirtNumberPaletteForClub,
} from "../lib/touchlineArena/shirt-number-colors.ts";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

test("defines one valid home-shirt number palette for each of the 20 clubs", () => {
  assert.equal(TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES.length, 20);

  const slugs = new Set<string>();
  const presets = new Set<string>();

  for (const palette of TOUCHLINE_HOME_SHIRT_NUMBER_PALETTES) {
    assert.match(palette.fill, HEX_COLOR);
    assert.match(palette.outline, HEX_COLOR);
    assert.ok(palette.clubName);
    assert.ok(palette.sourceUrl.startsWith("https://"));
    assert.ok(!slugs.has(palette.slug), `duplicate club slug: ${palette.slug}`);
    assert.ok(!presets.has(palette.preset), `duplicate preset: ${palette.preset}`);
    slugs.add(palette.slug);
    presets.add(palette.preset);
  }
});

test("resolves club aliases to the same palette", () => {
  assert.equal(touchlineShirtNumberPaletteForClub("Man City").slug, "manchester-city");
  assert.equal(touchlineShirtNumberPaletteForClub("Manchester City").slug, "manchester-city");
  assert.equal(touchlineShirtNumberPaletteForClub("Spurs").slug, "tottenham-hotspur");
  assert.equal(touchlineShirtNumberPaletteForClub("AFC Bournemouth").slug, "bournemouth");
});
