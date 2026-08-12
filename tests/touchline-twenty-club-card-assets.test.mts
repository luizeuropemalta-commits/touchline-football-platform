import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  TOUCHLINE_CARD_TIER_KEYS,
  TOUCHLINE_CARD_TIER_PALETTES,
  touchlineArenaClubTemplateForTierPreview,
} from "../lib/touchlineArena/card-rules.ts";
import { TOUCHLINE_ENGLAND_CLUBS } from "../lib/touchlineArena/demo-data.ts";

function localPublicPath(assetPath: string) {
  return path.join(process.cwd(), "public", decodeURIComponent(assetPath));
}

test("every TouchLine England club has each canonical tier frame and crest derivative", () => {
  assert.equal(TOUCHLINE_ENGLAND_CLUBS.length, 20);
  assert.equal(new Set(TOUCHLINE_ENGLAND_CLUBS.map((club) => club.teamId)).size, 20);

  for (const club of TOUCHLINE_ENGLAND_CLUBS) {
    assert.ok(club.logoUrl, `${club.name} needs a canonical crest`);
    assert.equal(existsSync(localPublicPath(club.logoUrl!)), true, `${club.name} crest asset missing`);
    for (const tier of TOUCHLINE_CARD_TIER_KEYS) {
      const full = touchlineArenaClubTemplateForTierPreview(club.name, tier);
      assert.ok(full, `${club.name} ${tier} full frame unavailable`);
      assert.equal(existsSync(localPublicPath(full!)), true, `${club.name} ${tier} full frame missing`);
      const compact = full!.replace("/cards/templates/clubs/", "/cards/templates/live-compact/clubs/").replace(/\.png$/i, ".webp");
      const zoom = full!.replace("/cards/templates/clubs/", "/cards/templates/zoom/clubs/").replace(/\.png$/i, ".webp");
      assert.equal(existsSync(localPublicPath(compact)), true, `${club.name} ${tier} compact frame missing`);
      assert.equal(existsSync(localPublicPath(zoom)), true, `${club.name} ${tier} zoom frame missing`);
    }
  }
});

test("all seven tier palettes supply a canonical neon edge colour", () => {
  assert.equal(Object.keys(TOUCHLINE_CARD_TIER_PALETTES).length, 7);
  for (const tier of TOUCHLINE_CARD_TIER_KEYS) {
    assert.match(TOUCHLINE_CARD_TIER_PALETTES[tier].accent, /^#[0-9a-f]{6}$/i);
    assert.match(TOUCHLINE_CARD_TIER_PALETTES[tier].secondary, /^#[0-9a-f]{6}$/i);
  }
});
