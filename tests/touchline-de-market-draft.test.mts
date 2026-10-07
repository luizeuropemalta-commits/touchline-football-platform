import assert from "node:assert/strict";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_MARKET_DRAFT_STATE,
  touchlineMarketDrafts,
} from "../lib/touchlineArena/locale-catalogues/market-drafts.ts";

test("de-DE Market draft has complete German presentation copy without opening the locale gate", () => {
  const copy = touchlineMarketDrafts["de-DE"];

  assert.equal(TOUCHLINE_MARKET_DRAFT_STATE, "draft");
  assert.equal(isTouchLineLocaleComplete("de-DE"), false);

  for (const value of Object.values(copy)) {
    if (typeof value === "string") assert.ok(value.trim().length > 0);
  }

  assert.deepEqual({
    search: copy.searchPlaceholder,
    unavailable: copy.cardUnavailable,
    checkout: copy.secureCheckout,
    progress: copy.squadProgress(2, 4),
    cards: copy.cardsFound(2),
    remaining: copy.playersRemaining(2),
    released: copy.contractReleased("Ada"),
  }, {
    search: "Spieler, Position oder Land suchen",
    unavailable: "Karte nicht verfügbar",
    checkout: "Geschützte Vertragsbestätigung",
    progress: "2/4 Spieler",
    cards: "2 Karten gefunden",
    remaining: "Es fehlen 2 Spieler bis zum vollständigen Kader",
    released: "Der Vertrag von Ada wurde für TouchLine Market Transfer freigegeben",
  });
});

test("de-DE Market draft preserves protected product and existing economic literals", () => {
  const copy = touchlineMarketDrafts["de-DE"];

  assert.equal(copy.productName, "Market Transfer");
  assert.equal(copy.fullProductName, "TouchLine Market Transfer");
  assert.equal(copy.touchlineCredits, "TouchLine Credits");
  assert.equal(copy.launchTestCheckout, "Testvertrag · 0 TC");
  assert.match(copy.launchTestNotice, /0 TC/);
  assert.match(copy.totalContractValue, /Touch Credits/);
  assert.equal(copy.oneSeasonContract, "Vertrag · 1 Saison");
});
