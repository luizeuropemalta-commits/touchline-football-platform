import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicCardPriceSurfaces = [
  "components/touchline/cards/TouchlineEliteExactCard.tsx",
  "lib/touchlineArena/card-zoom-details.ts",
  "components/touchline/ClubHubOfficialLineup.tsx",
  "components/touchline/club-owner/ClubOwnerProfileRenderer.tsx",
  "app/arena/ArenaClient.tsx",
  "components/touchline/ClubHubSquadGrid.tsx",
  "app/touchline-tables/touchline-tables-client.tsx",
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

test("Market Transfer presents card terms without exposing a player market valuation", () => {
  const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const marketCopy = readFileSync(new URL("../lib/touchlineArena/market-i18n.ts", import.meta.url), "utf8");

  assert.match(arenaSource, /function builderPlayerCommercialPrice/);
  assert.match(arenaSource, /builderPlayerCommercialPrice\(player, marketUi\.cardUnavailable\)/);
  assert.match(arenaSource, /builderPlayerCommercialPrice\(player, marketUi\.cardUnavailable\)/);
  assert.match(arenaSource, /marketSpotlightPlayer/);
  assert.match(arenaSource, /<TouchlineCardZoomDetailsPanel details=\{marketSpotlightZoomDetails\}/);
  assert.doesNotMatch(arenaSource, /<strong>\{builderPlayerRetailPriceTc\(player\)\} TC<\/strong>/);
  assert.doesNotMatch(arenaSource, /builderPlayerRetailPriceTc\(selectedBuilderPlayer\)\} TC/);
  assert.match(arenaSource, /formatTouchlineCommercialCardTotal/);
  assert.doesNotMatch(arenaSource, /\{rosterValueTc\} TC/);
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
  assert.doesNotMatch(arenaSource, /displayBuilderMarketValue|displayAuthoritativeMarketValue|displayMarketChange|displayMarketUpdate/);
  assert.doesNotMatch(arenaSource, /<small>\{marketUi\.marketValue\}<\/small>|marketUi\.marketChange|marketUi\.lastUpdate/);
});

test("ClubOwner keeps card assets separate from the TC wallet and can present editorial terms", () => {
  const clubOwner = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");
  const arenaCopy = readFileSync(new URL("../lib/touchlineArena/i18n.ts", import.meta.url), "utf8");

  assert.match(clubOwner, /formatTouchlineCommercialCardTotal\(\{ numericPrice: squadCardValue, competition: "england" \}\)/);
  assert.match(clubOwner, /formatTouchlineEditorialCardPrice/);
  assert.match(clubOwner, /formatTouchlineContractedCommercialCardPrice/);
  assert.match(clubOwner, /const publishedClubOwnerSquadCards = sortedClubOwnerSquadCards\.filter\(\(card\) => Boolean\(card\.editorialCard\)\)/);
  assert.match(clubOwner, /loadTouchlineFantasySnapshot\(activeClubOwnerUser\)/);
  assert.match(clubOwner, /<TouchlineGameweekTeamSnapshot snapshot=\{fantasySnapshot\}/);
  assert.doesNotMatch(clubOwner, /selectSavedArenaStartingXi|partitionClubOwnerRoster/);
  assert.match(clubOwner, /const startingShowcaseCards = publishedClubOwnerSquadCards\.slice\(0, 6\)/);
  assert.match(clubOwner, /startingShowcaseCards\.map\(\(card, index\) =>/);
  assert.match(clubOwner, /publishedClubOwnerSquadCards\.map\(\(card, index\) =>/);
  assert.doesNotMatch(clubOwner, /card\.editorialCard\?\.tierKey\s*\?\? \(card\.cardPriceAuthority === "active-contract"/);
  assert.doesNotMatch(clubOwner, /formatTouchlineVerifiedCommercialCardPrice/);
  assert.doesNotMatch(clubOwner, /walletBalanceTc \+ squadValueTc/);
  assert.doesNotMatch(clubOwner, /\{squadValueTc\} TC/);
  assert.match(clubOwner, /occupiedContractPercent/);
  assert.doesNotMatch(arenaCopy, /Squad TC Value|Valor TC atual do elenco|preços TC atuais/);
});

test("player-card rankings expose published card terms only", () => {
  const tablesPage = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
  const tablesClient = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
  const rankingsCopy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");
  const rankedCatalog = readFileSync(new URL("../lib/touchlineArena/ranked-card-catalog-server.ts", import.meta.url), "utf8");

  assert.match(tablesPage, /countTouchlinePublishedPlayerCards\(\)/);
  assert.match(tablesPage, /totalPublishedCards=\{publishedCardCount\}/);
  assert.match(tablesPage, /totalRankedCards=\{rankedCards\.length\}/);
  assert.doesNotMatch(tablesPage, /resolveTouchlineTablesOwnerSummary|formatTouchlineCommercialCardTotal/);
  assert.doesNotMatch(tablesClient, /squadValueTc|formatTouchlineCommercialCardTotal/);
  assert.match(tablesClient, /data-best-eleven-player/);
  const playerRankings = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.match(playerRankings, /formatTouchlineEditorialCardPrice/);
  assert.match(playerRankings, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(rankedCatalog, /loadTouchlinePublishedCardPresentations/);
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
