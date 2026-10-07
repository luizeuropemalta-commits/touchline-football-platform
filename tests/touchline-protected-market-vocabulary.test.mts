import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES as headerCopy, getTouchlineClubOwnerMarketCopy } from "../lib/touchlineArena/club-owner-market-i18n.ts";
import { TOUCHLINE_FANTASY_MARKET_STATE_CATALOGUES as stateCopy, getTouchlineFantasyMarketStateCopy } from "../lib/touchlineFantasy/market-state-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
// Owner-approved protected terms at actual paths, not an English-only sentence rule.
// Other governed names (ClubHub, TouchLine Verified, etc.) do not occur in these catalogues.
const requirements = [
  { path: ["header", "credits"], token: "TouchLine" },
  { path: ["state", "steps", "locked"], token: "Arena" },
] as const;

function assertProtectedVocabulary(catalogues: unknown) {
  for (const { path, token } of requirements) {
    let value: unknown = catalogues;
    for (const key of path) {
      assert.ok(value !== null && typeof value === "object" && Object.hasOwn(value, key), path.join("."));
      value = (value as Record<string, unknown>)[key];
    }
    assert.equal(typeof value, "string", path.join("."));
    const occurrences = (value as string).match(new RegExp(`(?<![\\p{L}\\p{N}_])${token}(?![\\p{L}\\p{N}_])`, "gu")) ?? [];
    assert.equal(occurrences.length, 1, `${path.join(".")} must preserve exactly one ${token}`);
  }
}

for (const locale of locales) {
  test(`actual ${locale} Market/header paths preserve canonical product names`, () => {
    assertProtectedVocabulary({ header: headerCopy[locale], state: stateCopy[locale] });
  });
}

test("the shared oracle accepts translated generic bank/credits/sync words", () => {
  for (const fixture of [
    { header: { bank: "Banco", credits: "Créditos TouchLine" }, state: { steps: { locked: "Enviar à Arena" } } },
    { header: { bank: "البنك", credits: "أرصدة TouchLine" }, state: { steps: { locked: "المزامنة مع Arena" } } },
    { header: { bank: "Bank", credits: "TouchLine-Credits" }, state: { steps: { locked: "Mit der Arena synchronisieren" } } },
  ]) assert.doesNotThrow(() => assertProtectedVocabulary(fixture));
});

test("negative controls reject translated, misspelled, duplicated or missing protected terms", () => {
  for (const credits of ["Créditos LinhaDeToque", "Touchline Credits", "NotTouchLine Credits", "TouchLine TouchLine Credits", ""]) {
    assert.throws(() => assertProtectedVocabulary({ header: { credits }, state: { steps: { locked: "Arena sync" } } }), /header\.credits/);
  }
  for (const locked of ["المزامنة مع الساحة", "arena sync", "ArenaExtra", "Arena Arena", ""]) {
    assert.throws(() => assertProtectedVocabulary({ header: { credits: "TouchLine Credits" }, state: { steps: { locked } } }), /state\.steps\.locked/);
  }
  assert.throws(() => assertProtectedVocabulary({ header: {}, state: {} }), /header\.credits/);
});

test("preserving product names does not publish any of the six draft locales", () => {
  for (const locale of locales.slice(2)) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(getTouchlineClubOwnerMarketCopy(locale), headerCopy["en-GB"]);
    assert.equal(getTouchlineFantasyMarketStateCopy(locale), stateCopy["en-GB"]);
  }
});

test("the actual header heading retains ClubOwner, not the superseded Market Transfer title", () => {
  // Render the real static heading only; full header rendering lives in its existing suite.
  const source = readFileSync(new URL("../components/touchline/ClubOwnerMarketHeader.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("header.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const headings: ts.JsxElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "h1") headings.push(node);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(headings.length, 1);
  const script = ts.transpileModule(`(${headings[0].getText(tree)})`, { compilerOptions: { jsx: ts.JsxEmit.React } }).outputText;
  assert.equal(renderToStaticMarkup(runInNewContext(script, { React })), "<h1>ClubOwner</h1>");
});
