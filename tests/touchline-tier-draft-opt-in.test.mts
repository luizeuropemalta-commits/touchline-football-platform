import assert from "node:assert/strict";
import test from "node:test";
import { touchlineCardTierName as canonicalName, TOUCHLINE_CARD_TIER_KEYS, TOUCHLINE_CARD_TIER_NAMES, TOUCHLINE_CARD_TIER_NAME_DRAFT_STATUS } from "../lib/touchlineArena/card-tier-names.ts";
import { touchlineCardTierName, touchlineCardTierPalette, TOUCHLINE_CARD_STARTING_TIER_KEY } from "../lib/touchlineArena/card-rules.ts";

const drafts = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("explicit tier-name opt-in reaches every authored language through both wrappers", () => {
  for (const tier of TOUCHLINE_CARD_TIER_KEYS) {
    for (const locale of drafts) {
      assert.equal(canonicalName(tier, locale, true), TOUCHLINE_CARD_TIER_NAMES[tier][locale]);
      assert.equal(touchlineCardTierName(tier, locale, true), TOUCHLINE_CARD_TIER_NAMES[tier][locale]);
      assert.equal(canonicalName(tier, locale), TOUCHLINE_CARD_TIER_NAMES[tier].en);
      assert.equal(touchlineCardTierName(tier, locale), TOUCHLINE_CARD_TIER_NAMES[tier].en);
    }
    assert.equal(canonicalName(tier, "pt-BR", true), TOUCHLINE_CARD_TIER_NAMES[tier].pt);
    assert.equal(canonicalName(tier, "en-GB", true), TOUCHLINE_CARD_TIER_NAMES[tier].en);
  }
  assert.equal(touchlineCardTierName("ruby-red", "fr-FR", true), "Rubis rouge");
  assert.equal(touchlineCardTierName("diamond-gold", "ar-SA", true), "ألماس ذهبي");
  assert.equal(TOUCHLINE_CARD_TIER_NAME_DRAFT_STATUS, "draft");
});

test("name opt-in never changes canonical keys, palettes or missing-tier defaults", () => {
  const keysBefore = [...TOUCHLINE_CARD_TIER_KEYS];
  const palettesBefore = TOUCHLINE_CARD_TIER_KEYS.map((tier) => ({ ...touchlineCardTierPalette(tier) }));
  for (const locale of drafts) {
    assert.equal(touchlineCardTierName(null, locale, true), canonicalName(TOUCHLINE_CARD_STARTING_TIER_KEY, locale, true));
    assert.equal(touchlineCardTierName(undefined, locale, true), canonicalName(TOUCHLINE_CARD_STARTING_TIER_KEY, locale, true));
    for (const tier of TOUCHLINE_CARD_TIER_KEYS) touchlineCardTierName(tier, locale, true);
  }
  assert.deepEqual(TOUCHLINE_CARD_TIER_KEYS, keysBefore);
  assert.deepEqual(TOUCHLINE_CARD_TIER_KEYS.map((tier) => touchlineCardTierPalette(tier)), palettesBefore);
});

test("invalid and legacy English locale values retain the English tier names", () => {
  for (const locale of ["en", "", "unknown", "__proto__", "AR-SA"]) {
    assert.equal(canonicalName("ruby-red", locale, true), "Red Ruby");
    assert.equal(touchlineCardTierName("ruby-red", locale, true), "Red Ruby");
  }
});
