import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";

test("ClubHub profile visual fixture stays static, local and split between confirmed and pending sheets", () => {
  const source = readFileSync(
    new URL("../app/visual-qa/clubhub-profile-contract/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /data-clubhub-profile-fixture=\{pending \? "pending-static" : "confirmed-static"\}/);
  assert.match(source, /buildTouchLineClubMatchdayPresentation/);
  assert.match(source, /Array\.from\(\{ length: 11 \}/);
  assert.match(source, /Array\.from\(\{ length: 9 \}/);
  assert.match(source, /officialCoach: pending[\s\S]*?\? null[\s\S]*?Static Official Coach/);
  assert.match(source, /ClubHubMatchdayTechnicalArea/);
  assert.match(source, /ClubHubOutsideMatchRoster/);
  assert.match(source, /TouchlineOfficialLeagueTable/);
  assert.match(source, /resolveTouchlineVisualQaLocale/);
  assert.match(source, /data-visual-qa-locale=\{locale\}/);
  assert.match(source, /locale=\{locale\}/);
  assert.match(source, /<ClubHubOfficialLineup[\s\S]*?staticVisualQa/);
  assert.match(source, /fixtures: \[\]/);
  assert.match(source, /390PX MOBILE · PENDING MATCHDAY SHEET/);
  assert.match(source, /390PX MOBILE · FICHA DE JOGO PENDENTE/);
  assert.match(source, /src=\{`\/visual-qa\/clubhub-profile-contract\?state=pending&viewport=mobile&lang=\$\{locale\}`\}/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.doesNotMatch(source, /create(?:Admin)?Client|supabase|createFootballDataProvider|providers\/sportmonks|process\.env|market-value-import|wallet/i);
});

test("the ClubHub line-up can isolate the static fixture from ranking activity", () => {
  const source = readFileSync(
    new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /staticVisualQa = false/);
  assert.match(source, /subscribeToRanking=\{!staticVisualQa\}/);
  assert.match(source, /enableInteractiveNeon=\{!staticVisualQa\}/);
  assert.match(source, /rankingMode=\{staticVisualQa \? "preview" : "live"\}/);
});

test("the nine-card bench is a premium responsive card rail", () => {
  const css = readFileSync(
    new URL("../components/touchline/ClubHubMatchdayTechnicalArea.module.css", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../components/touchline/ClubHubMatchdayTechnicalArea.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /TouchlineEliteExactCard/);
  assert.match(component, /TouchlineCardZoom/);
  const ast = ts.createSourceFile("bench.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers: ts.Expression[] = [], labels: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "zoomCopy" && node.initializer) initializers.push(node.initializer);
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "TouchlineCardZoom") {
      const attribute = node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === "ariaLabel");
      if (attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) labels.push(attribute.initializer.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.equal(initializers.length, 1); assert.equal(labels.length, 1);
  const evaluate = (expression: ts.Expression, context: Record<string, unknown>) => runInNewContext(
    ts.transpileModule(`(${expression.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2017 } }).outputText, context,
  );
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE", "unknown"]) {
    for (const name of ["Official Player", "Official $& Player <A>"]) {
      const card = Object.freeze({ name });
      const zoomCopy = evaluate(initializers[0], { locale, draftLocalesEnabled: false, getTouchlineCardZoomCopy });
      assert.equal(evaluate(labels[0], { card, zoomCopy }), `${locale === "pt-BR" ? "Ampliar card de" : "Expand card for"} ${name}`);
      const requested: string[] = [];
      const sentinelCopy = evaluate(initializers[0], { locale, draftLocalesEnabled: false, getTouchlineCardZoomCopy: (requestedLocale: string) => {
        requested.push(requestedLocale); return { expandCard: `SENTINEL:${requestedLocale}:{playerName}` };
      } });
      assert.deepEqual(requested, [locale]);
      assert.equal(evaluate(labels[0], { card, zoomCopy: sentinelCopy }), `SENTINEL:${locale}:${name}`);
    }
  }
  assert.match(component, /buildTouchlinePlayerCardZoomDetails/);
  assert.match(component, /buildTouchlineVerifiedMatchFactFields/);
  assert.match(component, /technical\.previewBench/);
  assert.match(component, /\.slice\(0, 9\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(9, minmax\(74px, 1fr\)\)/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis/);
});
