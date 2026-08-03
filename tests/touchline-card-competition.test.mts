import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_CARD_COMPETITION_PHASE,
  TOUCHLINE_CARD_STARTING_TIER_KEY,
  TOUCHLINE_CARD_TIER_KEYS,
  TOUCHLINE_CARD_TIER_NAMES,
  TOUCHLINE_CARD_TIER_PALETTES,
  touchlineArenaCardPrice,
  touchlineArenaClubTemplateForCard,
  touchlineArenaCompetitionTierForCard,
  touchlineCardTierName,
  touchlineCardTierPalette,
} from "../lib/touchlineArena/card-rules.ts";

test("every card surface resolves one canonical color for all seven tiers", () => {
  assert.deepEqual(Object.keys(TOUCHLINE_CARD_TIER_PALETTES), [...TOUCHLINE_CARD_TIER_KEYS]);
  assert.equal(new Set(Object.values(TOUCHLINE_CARD_TIER_PALETTES).map((palette) => palette.accent)).size, 7);

  for (const tier of TOUCHLINE_CARD_TIER_KEYS) {
    assert.equal(touchlineCardTierPalette(tier), TOUCHLINE_CARD_TIER_PALETTES[tier]);
    assert.match(touchlineCardTierPalette(tier).accent, /^#[0-9a-f]{6}$/i);
    assert.match(touchlineCardTierPalette(tier).secondary, /^#[0-9a-f]{6}$/i);
  }
});

test("all seven tier names have one official English and Portuguese identity", () => {
  assert.equal(Object.keys(TOUCHLINE_CARD_TIER_NAMES).length, 7);
  assert.equal(touchlineCardTierName("ruby-red", "en"), "Ruby Red");
  assert.equal(touchlineCardTierName("ruby-red", "pt-BR"), "Rubi Vermelho");
  assert.equal(touchlineCardTierName("diamond-gold", "en"), "Diamond Gold");
  assert.equal(touchlineCardTierName("diamond-gold", "pt-BR"), "Diamante Dourado");
});

test("player card color and price preserve the authoritative market-value tier", () => {
  assert.equal(TOUCHLINE_CARD_COMPETITION_PHASE, "preseason");
  assert.equal(TOUCHLINE_CARD_STARTING_TIER_KEY, "ruby-red");

  for (const requestedTier of [
    "ruby-red",
    "sapphire-blue",
    "amethyst-purple",
    "radiant-gold",
    "emerald-green",
    "clear-diamond",
    "diamond-gold",
  ] as const) {
    assert.equal(touchlineArenaCompetitionTierForCard(requestedTier).key, requestedTier);
  }

  assert.equal(touchlineArenaCardPrice(null, "ruby-red"), "0 TC");
  assert.equal(touchlineArenaCardPrice(null, "sapphire-blue"), "1 TC");
  assert.equal(touchlineArenaCardPrice(null, "diamond-gold"), "15 TC");
});

test("all 20 clubs preserve the authoritative market-value art", () => {
  const clubs = [
    "AFC Bournemouth",
    "Arsenal",
    "Aston Villa",
    "Brentford",
    "Brighton & Hove Albion",
    "Chelsea",
    "Coventry City",
    "Crystal Palace",
    "Everton",
    "Fulham",
    "Hull City",
    "Ipswich Town",
    "Leeds United",
    "Liverpool",
    "Manchester City",
    "Manchester United",
    "Newcastle United",
    "Nottingham Forest",
    "Sunderland",
    "Tottenham Hotspur",
  ];

  for (const club of clubs) {
    const template = touchlineArenaClubTemplateForCard(club, "€200M", "diamond-gold");
    assert.ok(template, `${club} must have a live card template`);
    assert.match(template, /diamond-gold\.png$/i, `${club} must preserve Diamond Gold`);
  }
});
