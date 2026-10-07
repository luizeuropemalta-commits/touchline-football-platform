import assert from "node:assert/strict";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_MARKET_DRAFT_STATE,
  touchlineMarketDrafts,
} from "../lib/touchlineArena/locale-catalogues/market-drafts.ts";

test("Turkish Market draft has Turkish presentation copy, preserved brands and no public-locale gate", () => {
  const copy = touchlineMarketDrafts["tr-TR"];

  assert.equal(TOUCHLINE_MARKET_DRAFT_STATE, "draft");
  assert.equal(isTouchLineLocaleComplete("tr-TR"), false);
  assert.equal(copy.searchPlaceholder, "Oyuncu, mevki veya ülke ara");
  assert.equal(copy.cardUnavailable, "Kart kullanılamıyor");
  assert.equal(copy.touchlineCredits, "TouchLine Credits");
  assert.equal(copy.fullProductName, "TouchLine Market Transfer");
  assert.equal(copy.cardsFound(3), "3 kart bulundu");
  assert.equal(copy.positionRosterCount(2, 4), "2/4 kadroda");
  assert.equal(copy.playerAlreadyOnPitch("Ada"), "Ada zaten sahada");

  for (const value of Object.values(copy)) {
    if (typeof value === "string") assert.ok(value.trim().length > 0);
  }
});
