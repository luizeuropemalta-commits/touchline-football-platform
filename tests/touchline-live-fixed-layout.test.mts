import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const css = readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");

test("Live shell fixes physical LTR geometry without forcing character order", () => {
  assert.match(component, /<main className=\{styles\.shell\}/);
  assert.match(css, /(?:^|\n)\.shell\s*\{[^}]*direction:\s*ltr\s*;/);
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(declarations, /direction:\s*rtl|unicode-bidi:\s*(?:bidi-override|isolate-override)/);
  assert.doesNotMatch(declarations, /:global\(\[dir=["']rtl["']\]\)/);
  assert.match(css, /\.layout\s*\{[^}]*grid-template-columns:\s*minmax\(340px,\s*390px\) minmax\(0,\s*1fr\)/);
  assert.match(css, /\.fixtureScore\s*\{[^}]*inset-inline-end:\s*47px/);
  assert.match(css, /\.fixture:hover\s*\{[^}]*translateX\(3px\)/);
  assert.match(css, /\.selectedFixture\s*\{[^}]*inset 3px 0 #b7ff4b/);
});

test("Live keeps home/away DOM order and text facts, not locale-conditioned swapping", () => {
  const ast = ts.createSourceFile("live.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const teams: ts.JsxElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attr =>
      ts.isJsxAttribute(attr) && attr.name.getText(ast) === "className" && attr.initializer?.getText(ast) === "{styles.heroTeams}")) teams.push(node);
    node.forEachChild(visit);
  }
  visit(ast);
  assert.equal(teams.length, 1, "the actual teams row is unique, independent of kickoff placement");
  const hero = teams[0].getText(ast);
  assert.ok(hero.indexOf('side="home"') < hero.indexOf('side="away"'));
  assert.match(hero, /selected\.homeTeam\?\.name \?\? dictionary\.homeFallback/);
  assert.match(hero, /selected\.awayTeam\?\.name \?\? dictionary\.awayFallback/);
  assert.doesNotMatch(hero, /ar-SA|reverse\(|row-reverse|dir="rtl"/);
});
