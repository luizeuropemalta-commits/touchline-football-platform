import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arena = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(start: string, end: string) {
  const from = arena.indexOf(start);
  const to = arena.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return arena.slice(from, to);
}

test("Arena public card adapters accept only editorial publication or a frozen contract", () => {
  const adapter = sourceBetween(
    "function resolveArenaPublicCardPresentation",
    "function arenaPublishedCardTemplateUrl",
  );

  assert.match(adapter, /parseTouchlinePublicEditorialCardPresentation\(input\.editorialCard\)/);
  assert.match(adapter, /input\.cardPriceAuthority === "active-contract"/);
  assert.match(adapter, /touchlineArenaTierForKey\(input\.cardTier\)/);
  assert.doesNotMatch(adapter, /marketValue/);
  assert.doesNotMatch(adapter, /touchlineArenaCompetitionTierForCard/);
});

test("non-demo Arena card adapters do not derive a public frame, tier, or price from valuation data", () => {
  const compactAdapters = sourceBetween(
    "function arenaCardToPlayer",
    "function builderPlayerSquadContractId",
  );
  const builderAdapter = sourceBetween(
    "function builderPlayerToPreviewCard",
    "function arenaPlayerZoomDetails",
  );

  for (const adapter of [compactAdapters, builderAdapter]) {
    assert.match(adapter, /resolveArenaPublicCardPresentation\(/);
    assert.match(adapter, /marketValue: null/);
    assert.match(adapter, /marketValueSource: "unavailable"/);
    assert.doesNotMatch(adapter, /touchlineArenaCompetitionTierForCard/);
    assert.doesNotMatch(adapter, /touchlineArenaClubTemplateForCard/);
  }

  assert.match(compactAdapters, /const cardTier = previewTier \?\? presentation\.cardTier/);
  assert.match(compactAdapters, /explicit local demo fixtures/);
  assert.match(compactAdapters, /arenaPublishedCardTemplateUrl\(/);
});

test("Arena keeps commerce code out of the presentation adapter boundary", () => {
  const adapter = sourceBetween(
    "function resolveArenaPublicCardPresentation",
    "function arenaShirtNumberLabel",
  );

  assert.doesNotMatch(adapter, /fetch\(/);
  assert.doesNotMatch(adapter, /resolveTouchlineCommercialCardPrice/);
  assert.doesNotMatch(adapter, /quoteTouchlineMarketCart/);
});

test("Arena bench and rankings show editorial or frozen terms, never a valuation placeholder", () => {
  const rankingPrice = sourceBetween(
    "function squadCardPriceLabel",
    "function builderPlayerHasPublishedCard",
  );

  assert.match(rankingPrice, /parseTouchlinePublicEditorialCardPresentation\(card\.editorialCard\)/);
  assert.match(rankingPrice, /formatTouchlineEditorialCardPrice/);
  assert.match(rankingPrice, /card\.cardPriceAuthority === "active-contract"/);
  assert.match(rankingPrice, /return null/);
  assert.doesNotMatch(rankingPrice, /resolveTouchlineVerifiedPlayerEconomy/);
  assert.doesNotMatch(arena, /verifiedMarketValueLabel/);
});

test("Arena Market gates cart availability and price sorting by the same published-card policy", () => {
  const marketPricing = sourceBetween(
    "function builderPlayerRetailPriceTc",
    "function builderPlayerToPreviewCard",
  );

  assert.match(marketPricing, /resolveArenaPublicCardPresentation\(player\)/);
  assert.match(marketPricing, /presentation\.editorialCard\.cardPrice\.amountMinor/);
  assert.match(marketPricing, /presentation\.cardPriceAuthority === "active-contract"/);
  assert.match(marketPricing, /function builderPlayerHasPublishedCard/);
  assert.doesNotMatch(marketPricing, /resolveTouchlineVerifiedPlayerEconomy/);
  assert.doesNotMatch(marketPricing, /resolvePlayerMarketTier/);
  assert.doesNotMatch(marketPricing, /marketValueEur|authoritativeMarketValueSource/);
  assert.match(arena, /!builderPlayerHasPublishedCard\(player\)/);
  assert.match(arena, /isInventoryUnavailable/);
  assert.match(arena, /isPositionLimitReached/);
  assert.match(arena, /className="team-builder-card-sign"/);
});

test("Arena Market presentation never renders raw valuation, valuation sorting, or valuation-change fields", () => {
  const marketPanel = sourceBetween(
    '{activeArenaPanel === "market" ? (\n                <div className="team-builder-shell">',
    '{activeArenaPanel === "rankings" ? (',
  );

  assert.match(marketPanel, /marketUi\.cardUnavailable/);
  assert.match(marketPanel, /value="tier-desc"/);
  assert.match(marketPanel, /marketUi\.sortTierHigh/);
  assert.match(marketPanel, /setMarketSpotlightPlayerId\(fieldId\)/);
  assert.match(marketPanel, /<TouchlineCardZoomDetailsPanel details=\{marketSpotlightZoomDetails\}/);
  assert.doesNotMatch(marketPanel, /displayBuilderMarketValue|displayAuthoritativeMarketValue|displayMarketChange|displayMarketUpdate/);
  assert.doesNotMatch(marketPanel, /marketUi\.(marketValue|marketChange|lastUpdate|ariaEconomicData|sortValueHigh)/);
  assert.doesNotMatch(marketPanel, /marketValueEur|marketValueUpdatedAt|marketValueChangeEur/);
});
