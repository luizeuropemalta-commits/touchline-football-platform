import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicCardPriceSurfaces = [
  "components/touchline/cards/TouchlineEliteExactCard.tsx",
  "lib/touchlineArena/card-zoom-details.ts",
  "components/touchline/ClubHubOfficialLineup.tsx",
  "components/touchline/ClubHubSquadGrid.tsx",
  "app/rankings/touchline-tables-client.tsx",
];

test("card-price surfaces use a shared approved presentation helper rather than inline wallet values", () => {
  for (const relativePath of publicCardPriceSurfaces) {
    const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
    assert.match(source, /(?:formatTouchlineMarketValueEur|formatTouchlineEditorialCardPrice|formatTouchlineContractedCommercialCardPrice|formatTouchlineVerifiedCommercialCardPrice|formatTouchlineCommercialCardPrice|buildTouchlinePlayerCardZoomDetails)/,
      `${relativePath} must use a shared approved card-price presentation helper`);
    assert.doesNotMatch(source, /\$\{(?:economy|spotlightPlayerEconomy)\.priceTc\} TC/,
      `${relativePath} must not render a card price as Touch Credits`);
  }
});

test("market-value hiding remains a public opt-in and changes only the visual value panel", () => {
  const card = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");
  const exactCards = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8")
    .match(/<TouchlineEliteExactCard\b[\s\S]*?\/>/g) ?? [];

  assert.match(card, /hideMarketValuePanel\?: boolean/);
  assert.match(card, /hideMarketValuePanel = false/);
  assert.match(card, /data-market-value=\{marketValueText \?\? "unavailable"\}/);
  assert.match(card, /\{!hideMarketValuePanel \? <div[\s\S]*?data-card-market-value-panel="true"[\s\S]*?compactSecondaryValue[\s\S]*?<\/div> : null\}/);

  for (const relativePath of [
    "app/rankings/touchline-tables-client.tsx",
    "app/touchline-player-card-rankings/page.tsx",
  ]) {
    const cards = exactCards(relativePath);
    assert.ok(cards.length, relativePath);
    cards.forEach(instance => assert.match(instance, /\bhideMarketValuePanel\b/, relativePath));
  }

  for (const relativePath of [
    "components/admin-manual-card-editorial-actions.tsx",
    "components/touchline/audit/TouchlineAuditStudio.tsx",
    "app/visual-qa/twenty-club-card-gallery/page.tsx",
  ]) {
    const cards = exactCards(relativePath);
    assert.ok(cards.length, relativePath);
    cards.forEach(instance => assert.doesNotMatch(instance, /\bhideMarketValuePanel\b/, relativePath));
  }
});

test("Market Transfer presents card terms without exposing a player market valuation", () => {
  const marketCopy = readFileSync(new URL("../lib/touchlineArena/market-i18n.ts", import.meta.url), "utf8");

  assert.match(marketCopy, /sortPriceLow: "Lowest card price"/);
  assert.match(marketCopy, /sortPriceLow: "Menor preço do card"/);
  assert.match(marketCopy, /sortTierHigh: "Highest card tier"/);
  assert.match(marketCopy, /sortTierHigh: "Maior categoria do card"/);
  assert.match(marketCopy, /cardUnavailable: "Card unavailable"/);
  assert.match(marketCopy, /cardUnavailable: "Card indisponível"/);
  assert.match(marketCopy, /touchlinePrice: "Card price"/);
  assert.match(marketCopy, /touchlinePrice: "Preço do card"/);
  assert.match(marketCopy, /totalContractValue: "Touch Credits required"/);
  assert.match(marketCopy, /totalContractValue: "Touch Credits necessários"/);
  assert.doesNotMatch(marketCopy, /Squad TC Value|Valor TC do elenco/);
  assert.doesNotMatch(marketCopy, /sortValueHigh|marketValue: "Market Value"|marketValue: "Valor de mercado"|marketChange|marketRange|ariaEconomicData/);
});

test("player-card rankings retain published authority without displaying card prices", () => {
  const tablesPage = readFileSync(new URL("../app/rankings/page.tsx", import.meta.url), "utf8");
  const tablesClient = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
  const rankingsCopy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");
  const rankedCatalog = readFileSync(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8");

  assert.match(tablesPage, /countTouchlinePublishedPlayerCards\(\)/);
  assert.match(tablesPage, /totalPublishedCards=\{publishedCardCount\}/);
  assert.match(tablesPage, /totalRankedCards=\{rankedCards\.length\}/);
  assert.doesNotMatch(tablesPage, /resolveTouchlineTablesOwnerSummary|formatTouchlineCommercialCardTotal/);
  assert.doesNotMatch(tablesClient, /squadValueTc|formatTouchlineCommercialCardTotal/);
  assert.match(tablesClient, /data-best-eleven-player/);
  const playerRankings = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(playerRankings, /formatTouchlineEditorialCardPrice|displayPrice/);
  assert.match(playerRankings, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(rankedCatalog, /loadCompleteTouchlineCataloguePresentations\(playerIds, catalogueAdmin\)/);
  assert.match(rankedCatalog, /if \([^\n]*!state\.seasonId[^\n]*\) return \[\];\s*const seasonId = state\.seasonId;/);
  assert.match(rankedCatalog, /readPublicSeasonPlayerPoints\(playerIds, \{[\s\S]*?\bseasonId,[\s\S]*?publishedRankingState: state/);
  assert.match(rankedCatalog, /requireCompleteRankedSeasonProjection\(playerIds, seasonPoints\)/);
  assert.match(rankedCatalog, /if \(!player \|\| !editorialCard\) return \[\]/);
  assert.match(playerRankings, /buildTouchlinePlayerCardZoomDetails/);
  assert.match(playerRankings, /editorialCard: card\.editorialCard/);
  assert.match(playerRankings, /activeContractCard: null/);
  assert.doesNotMatch(playerRankings, /resolveTouchlineVerifiedPlayerEconomy/);
  assert.doesNotMatch(playerRankings, /resolveTouchlineCommercialCardPrice|resolveTouchlineContractedCommercialCardPrice/);
  assert.doesNotMatch(playerRankings, /formatPlayerMarket(?:TierRange|ValueEur)/);
  assert.doesNotMatch(playerRankings, /Official economic profile|Perfil económico oficial/);
  assert.doesNotMatch(playerRankings, /Market value|Valor de mercado/);
  assert.doesNotMatch(playerRankings, /Pending|Pendente|Updating|Em atualização/);
  assert.doesNotMatch(tablesClient, /<strong>£\{owner\.squadValueTc\}<\/strong>/);
  assert.doesNotMatch(rankingsCopy, /current TC prices|preços TC atuais|Total TC|Total em TC/);
});
