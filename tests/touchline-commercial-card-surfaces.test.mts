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
  "app/touchline-players/[player]/page.tsx",
  "app/touchline-player-card-rankings/page.tsx",
  "app/touchline-tables/touchline-tables-client.tsx",
];

test("England card-price surfaces use the canonical commercial currency rather than TC", () => {
  for (const relativePath of publicCardPriceSurfaces) {
    const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
    assert.match(source, /(?:format|resolve)Touchline(?:Verified)?CommercialCardPrice/,
      `${relativePath} must use the commercial card-price contract`);
    assert.doesNotMatch(source, /\$\{(?:economy|spotlightPlayerEconomy)\.priceTc\} TC/,
      `${relativePath} must not render a card price as Touch Credits`);
  }
});

test("Market Transfer presents each selected card with its commercial offer while retaining TC only for wallet totals", () => {
  const arenaSource = readFileSync(new URL("../app/arena/ArenaClient.tsx", import.meta.url), "utf8");
  const marketCopy = readFileSync(new URL("../lib/touchlineArena/market-i18n.ts", import.meta.url), "utf8");

  assert.match(arenaSource, /function builderPlayerCommercialPrice/);
  assert.match(arenaSource, /builderPlayerCommercialPrice\(player, t\("marketValuePending"\)\)/);
  assert.match(arenaSource, /builderPlayerCommercialPrice\(selectedBuilderPlayer, t\("marketValuePending"\)\)/);
  assert.doesNotMatch(arenaSource, /<strong>\{builderPlayerRetailPriceTc\(player\)\} TC<\/strong>/);
  assert.doesNotMatch(arenaSource, /builderPlayerRetailPriceTc\(selectedBuilderPlayer\)\} TC/);
  assert.match(arenaSource, /formatTouchlineCommercialCardTotal/);
  assert.doesNotMatch(arenaSource, /\{rosterValueTc\} TC/);
  assert.match(marketCopy, /sortPriceLow: "Lowest card price"/);
  assert.match(marketCopy, /sortPriceLow: "Menor preço do card"/);
  assert.match(marketCopy, /touchlinePrice: "Card price"/);
  assert.match(marketCopy, /touchlinePrice: "Preço do card"/);
  assert.match(marketCopy, /totalContractValue: "Touch Credits required"/);
  assert.match(marketCopy, /totalContractValue: "Touch Credits necessários"/);
  assert.doesNotMatch(marketCopy, /Squad TC Value|Valor TC do elenco/);
});

test("ClubOwner keeps card assets in competition currency and never combines them with the TC wallet", () => {
  const clubOwner = readFileSync(new URL("../components/touchline/club-owner/ClubOwnerProfileRenderer.tsx", import.meta.url), "utf8");
  const arenaCopy = readFileSync(new URL("../lib/touchlineArena/i18n.ts", import.meta.url), "utf8");

  assert.match(clubOwner, /formatTouchlineCommercialCardTotal\(\{ numericPrice: squadCardValue, competition: "england" \}\)/);
  assert.match(clubOwner, /formatTouchlineVerifiedCommercialCardPrice/);
  assert.match(clubOwner, /formatTouchlineContractedCommercialCardPrice/);
  assert.match(clubOwner, /resolveTouchlineContractedCommercialCardPrice/);
  assert.doesNotMatch(clubOwner, /walletBalanceTc \+ squadValueTc/);
  assert.doesNotMatch(clubOwner, /\{squadValueTc\} TC/);
  assert.match(clubOwner, /occupiedContractPercent/);
  assert.doesNotMatch(arenaCopy, /Squad TC Value|Valor TC atual do elenco|preços TC atuais/);
});

test("public rankings keep unverified card economics pending rather than inventing a zero-price aggregate", () => {
  const tablesPage = readFileSync(new URL("../app/touchline-tables/page.tsx", import.meta.url), "utf8");
  const tablesClient = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
  const rankingsCopy = readFileSync(new URL("../lib/touchlineArena/rankings-i18n.ts", import.meta.url), "utf8");

  assert.match(tablesPage, /formatTouchlineCommercialCardTotal\(\{\s*numericPrice: totalOwnerValue,\s*competition: "england"/);
  assert.match(tablesClient, /formatTouchlineCommercialCardTotal\(\{\s*numericPrice: owner\.squadValueTc,\s*competition: "england"/);
  const playerRankings = readFileSync(new URL("../app/touchline-player-card-rankings/page.tsx", import.meta.url), "utf8");
  assert.match(playerRankings, /rankedCardPrices\.every\(\(price\) => price !== null\)/);
  assert.match(playerRankings, /formatTouchlineVerifiedCommercialCardPrice/);
  assert.doesNotMatch(tablesClient, /<strong>£\{owner\.squadValueTc\}<\/strong>/);
  assert.doesNotMatch(rankingsCopy, /current TC prices|preços TC atuais|Total TC|Total em TC/);
});
