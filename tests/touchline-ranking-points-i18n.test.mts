import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

type Label = (value: number, locale: string, fallbackLabel: string, draftLocalesEnabled?: boolean) => string;
async function loadLabel(): Promise<Label> {
  const path = new URL("../lib/touchlineArena/ranking-points-i18n.ts", import.meta.url).href;
  const loaded = await import(path) as { touchlineRankingPointsLabel: Label };
  assert.equal(typeof loaded.touchlineRankingPointsLabel, "function");
  return loaded.touchlineRankingPointsLabel;
}

// Prospective editorial contract, NOT native-language or release approval.
// The dual label remains pending independent linguistic review. Categories:
// https://unicode.org/cldr/charts/49/supplemental/language_plural_rules.html#ar
const arabicCases = [
  [0, "نقطة"], [1, "نقطة"], [2, "نقطتان"], [3, "نقاط"], [11, "نقطة"], [100, "نقطة"],
  [103, "نقاط"], [111, "نقطة"], [1.5, "نقطة"], [3.5, "نقطة"], [3.0001, "نقطة"],
  // Negative sporting points retain their sign in the existing numeric UI;
  // cardinal label selection must not clamp, abs-format or rewrite the score.
  // React's existing numeric rendering displays -0 as 0; the SSR oracle below
  // preserves that representation rather than introducing a formatting rule.
  [-0, "نقطة"], [-2, "نقطتان"], [-3, "نقاط"], [-11, "نقطة"], [-3.0001, "نقطة"],
] as const;

test("Arabic points labels distinguish cardinal categories without rounding fractional points", async () => {
  const label = await loadLabel();
  for (const [points, expected] of arabicCases) {
    assert.equal(label(points, "ar-SA", "FALLBACK", true), expected, String(points));
  }
});

test("points labels retain the supplied label outside the explicit Arabic draft gate", async () => {
  const label = await loadLabel();
  for (const points of [0, 1, 2, 3, 11, 100, 3.0001, -0, -2, -3, -11, -3.0001]) {
    assert.equal(label(points, "ar-SA", "pts"), "pts");
    assert.equal(label(points, "ar-SA", "pts", false), "pts");
    for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "tr-TR", "de-DE", "ar", "invalid"]) {
      assert.equal(label(points, locale, "UNCHANGED_$&_<label>", true), "UNCHANGED_$&_<label>", locale);
    }
  }
  for (const points of [NaN, Infinity, -Infinity]) assert.equal(label(points, "ar-SA", "UNAVAILABLE", true), "UNAVAILABLE");
});

const source = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("rankings.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function descendants(scope: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); node.forEachChild(visit); };
  visit(scope);
  return result;
}

for (const [consumer, row] of [
  ["TouchlineFeaturedCoach", "topCoachRow"],
  ["TouchlineCoachRankingTable", "coach"],
  ["TouchlineRankingEnding", "owner"],
] as const) {
  test(`${consumer} forwards its actual score and gate and preserves rendered numeric content`, async () => {
    const functions = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === consumer);
    assert.equal(functions.length, 1);
    const scope = functions[0];
    const calls = descendants(scope, node => ts.isCallExpression(node) && node.expression.getText(ast) === "touchlineRankingPointsLabel") as ts.CallExpression[];
    assert.equal(calls.length, 1, "one real points-label binding per consumer");
    assert.deepEqual(calls[0].arguments.map(argument => argument.getText(ast)), [`${row}.touchlinePoints`, "locale", "copy.pointsShort", "draftLocalesEnabled"]);
    const fragments = descendants(scope, node => ts.isJsxElement(node)
      && (row === "topCoachRow" ? node.openingElement.tagName.getText(ast) === "b"
        : node.openingElement.tagName.getText(ast) === "div" && node.openingElement.attributes.getText(ast).includes("styles.pointsValue"))
      && node.getText(ast).includes("touchlineRankingPointsLabel"));
    assert.equal(fragments.length, 1);
    const label = await loadLabel();
    for (const [points, expected] of arabicCases) for (const enabled of [false, true]) {
      const exports: Record<string, unknown> = {};
      runInNewContext(ts.transpileModule(`exports.view = (${fragments[0].getText(ast)});`, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText, {
        exports, [row]: Object.freeze({ touchlinePoints: points }), locale: "ar-SA", copy: { pointsShort: "pts" },
        draftLocalesEnabled: enabled, touchlineRankingPointsLabel: label, styles: { pointsValue: "pointsValue" },
        require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsx; },
      });
      const html = renderToStaticMarkup(exports.view as React.ReactElement);
      assert.ok(html.includes(row === "topCoachRow" ? `<b>${points} ` : `<strong>${points}</strong>`), html);
      assert.ok(html.includes(enabled ? expected : "pts"), html);
      assert.ok(html.indexOf(String(points)) < html.indexOf(enabled ? expected : "pts"), "numeric value stays before its unit");
    }
  });
}
