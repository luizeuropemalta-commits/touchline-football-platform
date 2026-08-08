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
