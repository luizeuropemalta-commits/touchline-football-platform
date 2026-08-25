import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { touchLineT } from "../lib/touchlineArena/i18n.ts";
import { getTouchLineMarketCopy } from "../lib/touchlineArena/market-i18n.ts";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("Market Transfer copy is centralized with Portuguese and English parity", () => {
  const english = getTouchLineMarketCopy("en-GB");
  const portuguese = getTouchLineMarketCopy("pt-BR");

  assert.deepEqual(Object.keys(portuguese), Object.keys(english));
  assert.equal(english.productName, "Market Transfer");
  assert.equal(portuguese.productName, "Market Transfer");
  assert.equal(english.fullProductName, "TouchLine Market Transfer");
  assert.equal(portuguese.fullProductName, "TouchLine Market Transfer");
  assert.equal(touchLineT("en-GB", "marketTransfer"), "Market Transfer");
  assert.equal(touchLineT("pt-BR", "marketTransfer"), "Market Transfer");
});

test("incomplete locales receive the complete English Market Transfer fallback", () => {
  assert.equal(getTouchLineMarketCopy("fr-FR").searchPlaceholder, "Search player, position or country");
  assert.equal(getTouchLineMarketCopy("ar-SA").ariaClearSearch, "Clear search");
  assert.equal(getTouchLineMarketCopy("unknown").fullProductName, "TouchLine Market Transfer");
});

test("card and copy counts use locale-aware singular and plural labels", () => {
  const english = getTouchLineMarketCopy("en-GB");
  const portuguese = getTouchLineMarketCopy("pt-BR");

  assert.equal(english.cardsFound(1), "1 card found");
  assert.equal(english.cardsFound(2), "2 cards found");
  assert.equal(english.copiesAvailable(1), "1 copy available");
  assert.equal(english.copiesAvailable(2), "2 copies available");
  assert.equal(portuguese.cardsFound(1), "1 card encontrado");
  assert.equal(portuguese.cardsFound(2), "2 cards encontrados");
  assert.equal(portuguese.copiesAvailable(1), "1 cópia disponível");
  assert.equal(portuguese.copiesAvailable(2), "2 cópias disponíveis");
});

test("the dedicated route resolves lang before rendering and localizes metadata", () => {
  const marketPage = source("app/market-transfer/page.tsx");

  assert.match(marketPage, /lang\?: string \| string\[\]/);
  assert.match(marketPage, /generateMetadata/);
  assert.match(marketPage, /marketLocale\(searchParams\)/);
  assert.match(marketPage, /locale === "pt-BR"/);
  assert.match(marketPage, /<FantasyGameweekClient initialSnapshot=\{snapshot\} locale=\{locale\}/);
  assert.match(marketPage, /title: "TouchLine Markt · Equipe da rodada"/);
  assert.match(marketPage, /title: "TouchLine Markt · Gameweek XI"/);
});

test("shared Market Transfer navigation contains no retired product name", () => {
  const sources = [
    source("lib/touchlineArena/i18n.ts"),
    source("lib/touchlineArena/auth-i18n.ts"),
    source("components/touchline/TouchlineProfileQuickNav.tsx"),
    source("app/market-transfer/page.tsx"),
  ];

  for (const fileSource of sources) {
    assert.doesNotMatch(fileSource, /Transfer Market|Mercado de Transferências/i);
  }
});
