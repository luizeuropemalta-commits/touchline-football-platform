import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clubBudgetEstimate } from "../lib/touchlineFantasy/club-budget-calculator.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";

const players = (count: number) => Array.from({ length: count }, (_, i) => ({ playerId: `p${i}` }));
test("confirmed contracts yield vacancies and floored indicative average, never count coach", () => {
  assert.deepEqual(clubBudgetEstimate({ balanceEur: 900_000_000, players: players(20) }), { vacancies: 15, balance: 900_000_000, average: 60_000_000 });
  assert.equal(clubBudgetEstimate({ balanceEur: 100, players: players(32) })?.average, 33);
  assert.equal(clubBudgetEstimate({ balanceEur: 0, players: players(0) })?.average, 0);
  assert.equal(clubBudgetEstimate({ balanceEur: 90, players: players(35) })?.average, null);
});
test("invalid or missing snapshots do not invent an estimate", () => {
  assert.equal(clubBudgetEstimate(null), null);
  for (const balanceEur of [-1, NaN, Infinity, 1.5]) assert.equal(clubBudgetEstimate({ balanceEur, players: [] }), null);
  assert.equal(clubBudgetEstimate({ balanceEur: 5, players: players(36) }), null);
  assert.equal(clubBudgetEstimate({ balanceEur: 5, players: [{ playerId: "x" }, { playerId: "x" }] }), null);
});
test("actual component uses confirmed snapshot only and updates after authoritative replacement", () => {
  const source = readFileSync(new URL("../components/touchline/fantasy/ClubOwnerBudgetCalculator.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("calculator.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = tree.statements.find(node => ts.isFunctionDeclaration(node));
  assert.ok(fn);
  let context: { state: { balanceEur: number; players: { playerId: string }[] } | null; verificationStatus: string }
    = { state: { balanceEur: 900_000_000, players: players(20) }, verificationStatus: "confirmed" };
  const Component = vm.runInNewContext(ts.transpileModule(`${fn.getText(tree).replace(/^export default\s+/, "")}\nClubOwnerBudgetCalculator;`,
    { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText,
  { React, styles: {}, clubBudgetEstimate, resolveTouchlineCatalogueLocale, useConfirmedClubCollection: () => context });
  const render = (locale = "pt-BR", draftLocalesEnabled = false) => renderToStaticMarkup(React.createElement(Component, { locale, draftLocalesEnabled }));
  assert.match(render(), /<dd>15<small>/); assert.match(render(), /Média por vaga<\/dt><dd>60.000.000 <small>TC/);
  assert.match(render(), /data-budget-affordability="indeterminate"/);
  assert.match(render(), /catálogo completo e verificado ainda não foi confirmado/);
  assert.match(render(), /não é um limite de preço/);
  context.verificationStatus = "pending"; assert.doesNotMatch(render(), /disponíveis|Média|data-budget-affordability/);
  context = { state: { balanceEur: 840_000_000, players: players(21) }, verificationStatus: "confirmed" };
  assert.match(render(), /<dd>14<small>/); assert.match(render(), /Média por vaga<\/dt><dd>60.000.000 <small>TC/);
  context.state = { balanceEur: 1_999_999, players: players(34) };
  assert.match(render(), /Saldo disponível<\/dt><dd>1.999.999 <small>TC/);
  assert.match(render(), /Média por vaga<\/dt><dd>1.999.999 <small>TC/);
  assert.doesNotMatch(render(), /2M|2.000.000/);
  context.state = { balanceEur: 5_999_999, players: players(32) };
  assert.match(render(), /Média por vaga<\/dt><dd>1.999.999 <small>TC/);
  for (const [locale, expected] of Object.entries({ "en-GB": "Average", "pt-BR": "Média", "es-ES": "Media", "it-IT": "Media", "fr-FR": "Moyenne", "ar-SA": "المتوسط", "tr-TR": "Ortalama", "de-DE": "Durchschnitt" })) {
    assert.ok(render(locale, true).toLocaleLowerCase(locale).includes(expected.toLocaleLowerCase(locale)));
    assert.ok(render(locale, true).includes(new Intl.NumberFormat(locale).format(1_999_999)));
    assert.match(render(locale, true), /data-budget-affordability="indeterminate"/);
  }
  assert.match(render("de-DE"), /Average per place<\/dt><dd>1,999,999 <small>TC/);
  context.state = { balanceEur: 10, players: players(35) }; assert.match(render(), /Elenco completo/); assert.match(render(), /Média por vaga<\/dt><dd>—/);
  assert.doesNotMatch(render(), /data-budget-affordability/);
  context.state = null; assert.match(render(), /Contrate o treinador/); assert.doesNotMatch(render(), /disponíveis/);
  context.verificationStatus = "unavailable"; assert.match(render(), /indisponíveis/);
});
