import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlinePlayerZoomIdentityCopy } from "../lib/touchlineArena/player-zoom-identity-i18n.ts";
import { buildTouchlinePlayerCardZoomDetails } from "../lib/touchlineArena/card-zoom-details.ts";

import {
  resolveTouchlinePublicEditorialCardPresentation,
  formatTouchlineMarketValueEur,
} from "../lib/touchlineArena/editorial-card-profile.ts";

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
const squadRoute = readFileSync(
  new URL("../lib/football-data/public-premier-squad-server.ts", import.meta.url),
  "utf8",
);
const zoomDetails = readFileSync(
  new URL("../lib/touchlineArena/card-zoom-details.ts", import.meta.url),
  "utf8",
);
const demoData = readFileSync(
  new URL("../lib/touchlineArena/demo-data.ts", import.meta.url),
  "utf8",
);

const editorialRecord = {
  playerId: "955c3d22-92d4-4e06-bb8d-c92b23f1cb01",
  tierKey: "radiant-gold",
  cardPrice: { amountMinor: 1500, currency: "GBP" },
  publicationState: "published",
  lastReviewedAt: "2026-08-11T10:00:00Z",
  internalNote: "Editorial-only note",
  internalSource: "Editorial-only source",
} as const;

test("only explicitly published editorial records cross the public card boundary", () => {
  const published = resolveTouchlinePublicEditorialCardPresentation(editorialRecord);
  const draft = resolveTouchlinePublicEditorialCardPresentation({
    ...editorialRecord,
    publicationState: "detected",
  });
  const review = resolveTouchlinePublicEditorialCardPresentation({
    ...editorialRecord,
    publicationState: "ready_for_review",
  });

  assert.deepEqual(published, {
    tierKey: "radiant-gold",
    cardPrice: { amountMinor: 1500, currency: "GBP" },
    lastReviewedAt: "2026-08-11T10:00:00Z",
  });
  assert.equal("internalNote" in (published ?? {}), false);
  assert.equal("internalSource" in (published ?? {}), false);
  assert.equal(draft, null);
  assert.equal(review, null);
});

test("the shared exact card preserves the editorial tier and exposes verified Market Value", () => {
  assert.match(card, /editorialCard\?: TouchlinePublicEditorialCardPresentation \| null/);
  assert.match(card, /const editorialCard = player\.editorialCard \?\? null/);
  assert.match(card, /formatTouchlineMarketValueEur\(editorialCard\.marketValueEur, runtimeLocale \?\? undefined\)/);
  assert.match(card, /player\.marketValueState === "verified"/);
  assert.match(card, /data-card-editorial-state=\{reviewRequired \? "review_required" : publicationPending \? "publication_pending" : editorialCard \? "published" : "unpublished"\}/);
  assert.match(card, /if \(!editorialCard && !contractedTier && !allowVisualInventoryPreview && !reviewRequired && !publicationPending\) return null/);

  assert.doesNotMatch(card, /resolveTouchlineVerifiedPlayerEconomy/);
  assert.doesNotMatch(card, /resolveTouchlinePublicCardPresentation/);
  assert.equal(getTouchlineExactCardCopy("en-GB").marketValue, "Market value");
  assert.equal(getTouchlineExactCardCopy("pt-BR").marketValue, "Valor de mercado");
  assert.match(card, /const exactCopy = getTouchlineExactCardCopy\(runtimeLocale, draftLocalesEnabled\)/);
  assert.match(card, /cardLabels\.marketValue \?\? exactCopy\.marketValue/);
});

test("an unpublished football player cannot become a commercial card through artwork or a legacy price", () => {
  assert.match(card, /const cardTemplateUrl = neutralIdentity[\s\S]{0,240}: assignedVisualTemplateUrl;/);
  assert.match(card, /if \(!editorialCard && !contractedTier && !allowVisualInventoryPreview && !reviewRequired && !publicationPending\) return null/);
  assert.match(card, /allowVisualInventoryPreview = false/);
  assert.match(card, /player\.cardPriceAuthority === "active-contract"/);
  assert.doesNotMatch(card, /formatTouchlineContractedCommercialCardPrice/);
  assert.match(
    card,
    /marketTier\n\s*\? touchlineArenaClubTemplateForTierPreview\(player\.clubName, marketTier\.key\) \|\| assignedVisualTemplateUrl\n\s*: assignedVisualTemplateUrl/,
  );
  assert.match(
    demoData,
    /cardTemplateUrl: touchlineArenaClubTemplateForCard\(card\.clubName, null, cardTier\) \|\| null/,
  );
});

test("ClubHub has an explicit safe cutover and exposes only verified or exactly-labelled provisional values", () => {
  assert.match(squadRoute, /isTouchlineCardPublicationGateEnabled/);
  assert.match(squadRoute, /const publicationGateEnabled = isTouchlineCardPublicationGateEnabled\(\)/);
  assert.match(squadRoute, /includeMarketValues:\s*true/);
  assert.match(squadRoute, /loadTouchlinePublishedCardPresentations/);
  assert.match(squadRoute, /legacyVerifiedCardPresentation/);
  assert.match(squadRoute, /currency: "GBP"/);
  assert.match(squadRoute, /publicationGateEnabled \? "touchline_editorial" : "touchline_legacy_verified"/);
  assert.match(squadRoute, /cardTier: editorialCard\?\.tierKey \?\? null/);
  assert.match(squadRoute, /marketValueEur: projectedMarketValueEur \?\? null/);
  assert.match(squadRoute, /projectedMarketValueState === "provisional"/);
  assert.match(squadRoute, /\? "provisional-fallback"/);
  assert.match(squadRoute, /authoritativeMarketValueSource: projectedMarketValueEur === null/);
  assert.doesNotMatch(squadRoute, /parseMarketValueEur/);

  assert.match(squadRoute, /export function publicPremierSquadPlayerToCard/);
  assert.match(squadRoute, /editorialCard: player\.editorialCard \?\? null/);
  assert.match(clubHubPage, /publicPremierSquadPlayerToCard/);
  assert.match(clubHubPage, /\.map\(\(player\) => publicPremierSquadPlayerToCard\(player, club\.name\)\)/);
});

test("ClubHub grid, official lineup and zoom use the shared editorial presentation", () => {
  for (const surface of [grid, lineup]) {
    assert.match(surface, /const tierKey = card\.editorialCard\?\.tierKey \?\? null/);
    assert.match(surface, /buildTouchlinePlayerCardZoomDetails\(\{/);
    assert.match(surface, /editorialCard: card\.editorialCard/);
    assert.match(surface, /activeContractCard: null/);
    assert.doesNotMatch(surface, /resolveTouchlinePublicCardPresentation/);
    assert.doesNotMatch(surface, /resolveTouchlineVerifiedPlayerEconomy/);
    assert.doesNotMatch(surface, /activeContractCard: activeContract/);
  }

  assert.match(zoomDetails, /editorialCard\?: TouchlinePublicEditorialCardPresentation \| null/);
  assert.match(zoomDetails, /formatTouchlineMarketValueEur\(input\.editorialCard\.marketValueEur, input\.locale\)/);
  assert.doesNotMatch(zoomDetails, /resolveTouchlinePublicCardPresentation/);
  for (const locale of ["en-GB", "pt-BR"]) {
    const copy = getTouchlinePlayerZoomIdentityCopy(locale);
    assert.equal(copy.marketValue, locale === "pt-BR" ? "Valor de mercado" : "Market value");
    assert.equal(copy.provisionalValue, locale === "pt-BR" ? "Valor provisório" : "Provisional value");
    const published = resolveTouchlinePublicEditorialCardPresentation(editorialRecord);
    assert.ok(published);
    const scenarios = [
      { editorialCard: { ...published, marketValueEur: 2_000_000, marketValueState: "verified" as const }, label: copy.marketValue, value: formatTouchlineMarketValueEur(2_000_000, locale) },
      { editorialCard: { ...published, marketValueEur: 1_000_000, marketValueState: "provisional" as const }, label: copy.provisionalValue, value: "€1M" },
      { editorialCard: { ...published, marketValueEur: 0, marketValueState: "verified" as const }, label: copy.marketValue, value: formatTouchlineMarketValueEur(0, locale) },
      { editorialCard: published, marketValue: "VERIFIED_SOURCE", marketValueState: "verified", label: copy.marketValue, value: "VERIFIED_SOURCE" },
      { editorialCard: published, marketValue: "UNVERIFIED_SOURCE", marketValueState: "unavailable", label: copy.marketValue, value: copy.pending },
    ];
    for (const { label, value, ...input } of scenarios) {
      const details = buildTouchlinePlayerCardZoomDetails({ locale, name: "Canonical Player", ...input });
      const valueField = details.fields.find((field) => field.icon === "player-identity-price");
      assert.ok(valueField);
      assert.equal(valueField.label, label);
      assert.equal(valueField.value, value);
      assert.equal(details.fields.some((field) => /Card price|Preço do card/.test(field.label)), false);
      assert.equal(details.fields.some((field) => /1500|£15|GBP|UNVERIFIED_SOURCE/.test(field.value)), false);
    }
  }
});

test("ClubHub game-card surfaces never use contract or unverified valuation fallback", () => {
  for (const surface of [grid, lineup]) {
    assert.doesNotMatch(surface, /cardPriceAuthority === "active-contract"|formatTouchlineContractedCommercialCardPrice|contractHref=\{activeContract/);
  }
  assert.match(card, /const marketValueText = editorialCard\?\.marketValueEur/);
  assert.match(card, /player\.marketValueState === "verified"/);
});
