import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasTouchlinePublicCardState,
  resolveTouchlinePublicCardPresentation,
} from "../lib/touchlineArena/public-card-presentation.ts";

const card = readFileSync(
  new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url),
  "utf8",
);
const grid = readFileSync(
  new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url),
  "utf8",
);
const lineup = readFileSync(
  new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url),
  "utf8",
);
const clubHubPage = readFileSync(
  new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url),
  "utf8",
);
const arena = readFileSync(
  new URL("../app/arena/ArenaClient.tsx", import.meta.url),
  "utf8",
);
const arenaLineup = readFileSync(
  new URL("../lib/football-data/arena-lineup.ts", import.meta.url),
  "utf8",
);
const authoritativeArenaState = readFileSync(
  new URL("../lib/touchlineArena/authoritative-arena-state.ts", import.meta.url),
  "utf8",
);
const zoomDetails = readFileSync(
  new URL("../lib/touchlineArena/card-zoom-details.ts", import.meta.url),
  "utf8",
);

test("canonical pending states are neutral while an active contract keeps its stored tier", () => {
  const pending = resolveTouchlinePublicCardPresentation({
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "pending",
    classificationState: "pending",
  });
  const contract = resolveTouchlinePublicCardPresentation({
    marketValue: null,
    marketValueSource: "unavailable",
    marketValueState: "pending",
    classificationState: "pending",
    cardTier: "sapphire-blue",
    cardPriceAuthority: "active-contract",
  });

  assert.deepEqual([pending.visualState, pending.tierKey, pending.canExposeCommercialPresentation], ["pending", null, false]);
  assert.deepEqual([contract.visualState, contract.tierKey, contract.canExposeCommercialPresentation], ["active-contract", "sapphire-blue", true]);

  const verifiedZero = resolveTouchlinePublicCardPresentation({
    marketValue: 0,
    marketValueSource: "verified-cache",
    marketValueState: "verified",
    classificationState: "verified",
    cardTier: "ruby-red",
  });
  assert.deepEqual([verifiedZero.visualState, verifiedZero.tierKey, verifiedZero.canExposeCommercialPresentation], ["verified", "ruby-red", true]);
});

test("release card layer retains the established commercial branch and adds no launch-offer rule", () => {
  assert.match(card, /const legacyCardPriceText = contractedCardPriceText/);
  assert.match(card, /const hasCanonicalPublicState = player\.marketValueState != null \|\| player\.classificationState != null/);
  assert.match(card, /data-card-tier=\{marketTier\?\.key \?\? "neutral"\}/);
  assert.match(card, /staticRenderScale\?: number/);
  assert.match(card, /opacity: hasStaticRenderScale \|\| scale > 0 \? 1 : 0/);
  assert.doesNotMatch(card, /displayPrice/);
  assert.doesNotMatch(card, /launchSeasonIncluded/);
});

test("public card hardening is opt-in and keeps legacy ClubHub offers intact", () => {
  assert.equal(hasTouchlinePublicCardState({}), false);
  assert.equal(hasTouchlinePublicCardState({ marketValueState: "pending" }), true);
  assert.match(grid, /const presentation = hasCanonicalPublicState \? resolveTouchlinePublicCardPresentation\(card\) : null/);
  assert.match(grid, /: touchlineArenaContractHref\(\{ locale, playerId: card\.id, playerName: card\.name, clubId \}\)/);
  assert.match(lineup, /const presentation = hasCanonicalPublicState \? resolveTouchlinePublicCardPresentation\(card\) : null/);
  assert.match(lineup, /const contractedTier = card\.cardPriceAuthority === "active-contract"/);
  assert.match(lineup, /: touchlineArenaContractHref\(\{/);
});

test("ClubHub and Arena preserve canonical pending states through every card adapter", () => {
  assert.match(clubHubPage, /marketValueState\?: ClubOwnerSquadCard\["marketValueState"\]/);
  assert.match(clubHubPage, /classificationState\?: ClubOwnerSquadCard\["classificationState"\]/);
  assert.match(clubHubPage, /marketValueState: player\.marketValueState/);
  assert.match(clubHubPage, /classificationState: player\.classificationState/);
  assert.match(clubHubPage, /marketValueState: "unavailable"/);
  assert.match(clubHubPage, /classificationState: "unavailable"/);

  assert.match(arenaLineup, /marketValueState\?: "verified" \| "pending" \| "unavailable" \| "error" \| null/);
  assert.match(arenaLineup, /classificationState\?: "verified" \| "pending" \| "unavailable" \| "error" \| null/);
  assert.match(authoritativeArenaState, /rosterCard\.marketValueState != null/);
  assert.match(authoritativeArenaState, /rosterCard\.classificationState != null/);

  for (const expression of [
    "marketValueState: squadPlayer.marketValueState ?? player.card.marketValueState",
    "classificationState: squadPlayer.classificationState ?? player.card.classificationState",
    "marketValueState: bench.marketValueState",
    "classificationState: bench.classificationState",
    "marketValueState: player.marketValueState",
    "classificationState: player.classificationState",
    "marketValueState: card?.marketValueState",
    "classificationState: card?.classificationState",
  ]) {
    assert.ok(arena.includes(expression), `Arena state propagation is missing ${expression}`);
  }
  assert.match(arena, /cardPriceAuthority: bench\.cardPriceAuthority \?\? undefined/);
  assert.match(arena, /cardPriceAuthority: player\.cardPriceAuthority \?\? undefined/);
  assert.match(arena, /formatTouchlineContractedCommercialCardPrice\(\{/);
  assert.match(grid, /marketValueState: card\.marketValueState/);
  assert.match(grid, /classificationState: card\.classificationState/);
  assert.match(grid, /cardPriceAuthority: card\.cardPriceAuthority/);
  assert.match(zoomDetails, /resolveTouchlinePublicCardPresentation\(\{/);
  assert.match(zoomDetails, /formatTouchlineContractedCommercialCardPrice\(\{/);
});

test("Arena treats a verified EUR 0 value as Ruby rather than a fabricated pending state", () => {
  assert.match(arena, /parseMarketValueEurOrNull/);
  assert.match(arena, /if \(marketValue === null\) return "Pending"/);
  assert.match(arena, /return parseMarketValueEurOrNull\(value\) !== null/);
  assert.doesNotMatch(arena, /function normalizeMarketValueLabel[\s\S]{0,220}marketValue <= 0/);
  assert.doesNotMatch(arena, /function displayBuilderMarketValue[\s\S]{0,220}marketValue <= 0/);
});
