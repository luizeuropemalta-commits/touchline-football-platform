import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clubValueSummary } from "../lib/touchlineFantasy/club-value-summary.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

const state = { balanceEur: 999, coach: { valueEur: 777 }, players: [{ playerId: "p", valueEur: 5 }] };
const quote = { id: "display", canonicalPlayerId: "p", editorialCard: { marketValueEur: 100, marketValueState: "verified" } };
test("valuation uses current canonical published quotes, excludes paid cost, coach and wallet", () => {
  assert.deepEqual(clubValueSummary(state, [quote]), { count: 1, missing: 0, provisional: 0, value: 100 });
  assert.equal(clubValueSummary(state, [{ ...quote, editorialCard: { ...quote.editorialCard, marketValueEur: 150 } }])?.value, 150);
  assert.equal(state.players[0].valueEur, 5);
  assert.equal(clubValueSummary({ players: [] }, [])?.value, 0);
});
test("missing, provisional, duplicate and invalid quotes never turn into a false zero total", () => {
  assert.equal(clubValueSummary(null, []) ,null);
  assert.equal(clubValueSummary({ players: [...state.players, ...state.players] }, [quote]), null);
  for (const catalogue of [[], [quote, quote], [{ ...quote, editorialCard: { marketValueEur: 0 } }]]) {
    assert.equal(clubValueSummary(state, catalogue)?.value, null);
    assert.equal(clubValueSummary(state, catalogue)?.missing, 1);
  }
  assert.deepEqual(clubValueSummary(state, [{ ...quote, editorialCard: { ...quote.editorialCard, marketValueState: "provisional" } }]),
    { count: 1, missing: 0, provisional: 1, value: null });
});
test("actual summary suppresses pending state and localizes confirmed count/value", () => {
  const source = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerValueSummary.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("value.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = tree.statements.find(ts.isFunctionDeclaration)!;
  const context = { state, verificationStatus: "confirmed" };
  const Component = vm.runInNewContext(ts.transpileModule(`${fn.getText(tree).replace(/^export default\s+/, "")}\nClubOwnerValueSummary;`,
    { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText,
  { React, styles: {}, clubValueSummary, resolveTouchlineCatalogueLocale, useConfirmedClubCollection: () => context });
  const render = (catalogue = [quote], locale = "pt-BR") => renderToStaticMarkup(React.createElement(Component, { catalogue, locale, draftLocalesEnabled: true }));
  assert.match(render(), /<dt>Club Value<\/dt><dd>100 <small>TC<\/small>/);
  assert.match(render(), /<dt>Jogadores<\/dt><dd>1<small> \/ 35<\/small>/);
  assert.match(render([]), /Indisponível/);
  assert.match(render([]), /Valores ausentes: 1/);
  context.verificationStatus = "pending";
  assert.doesNotMatch(render(), /100 <small>|<dd>1<small>/);
  context.verificationStatus = "unavailable";
  assert.doesNotMatch(render(), /100 <small>|<dd>1<small>/);
  context.verificationStatus = "confirmed";
  assert.match(render([quote], "de-DE"), /Spieler/);
});
