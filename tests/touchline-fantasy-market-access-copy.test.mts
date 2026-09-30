import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Execute the actual presentation expressions, not a second copy of their rules.
// This is bounded JSX coverage, not a mounted component or browser-flow proof.
const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements: ts.JsxElement[] = [];
const declarations: string[] = [];
function visit(node: ts.Node) {
  if (ts.isJsxElement(node)) elements.push(node);
  if (ts.isVariableDeclaration(node) && ["editable", "marketOpen", "marketStatusLabel", "marketAccessLabel"].includes(node.name.getText(tree))) {
    declarations.push(`const ${node.getText(tree)};`);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
function hasClass(node: ts.JsxElement, name: string) {
  return node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
    && attribute.name.getText(tree) === "className"
    && attribute.initializer?.getText(tree) === `{styles.${name}}`);
}
function firstStrongIn(name: string) {
  const container = elements.find((node) => hasClass(node, name));
  assert.ok(container, name);
  const strong = elements.find((node) => node.pos > container.pos && node.end < container.end && node.openingElement.tagName.getText(tree) === "strong");
  assert.ok(strong, `${name} strong`);
  return strong;
}
const accessLabels = elements.filter((node) => hasClass(node, "marketClosedLabel")
  && ts.isConditionalExpression(node.parent)
  && ["editable", "!editable", "editable || marketPage"].includes(node.parent.condition.getText(tree)));
assert.equal(accessLabels.length, 3, "tactical slots, card slots and catalogue read-only labels");
function render(node: ts.JsxElement, input: Record<string, unknown>) {
  const javascript = ts.transpileModule(`(() => { ${declarations.join("\n")} return (${node.getText(tree)}); })()`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const element = vm.runInNewContext(javascript, { React, styles: {}, ...input });
  return renderToStaticMarkup(element).replace(/<[^>]+>/g, "");
}

for (const pt of [true, false]) {
  test(`My Club separates calendar state from permission (${pt ? "pt" : "en"})`, () => {
    const viewOnly = pt ? "Somente consulta" : "View only";
    const closed = pt ? "Mercado fechado" : "Market Closed";
    const unavailable = pt ? "Indisponível" : "Unavailable";
    for (const entitlementActive of [false, undefined]) {
      const input = { pt, snapshot: { entitlementActive }, activeGameweek: { state: "MARKET_OPEN" }, deadlineReached: false };
      for (const label of accessLabels) assert.equal(render(label, input), viewOnly);
      assert.equal(render(firstStrongIn("myClubMarketStatus"), input), pt ? "Mercado aberto" : "Market Open");
    }
    for (const input of [
      { activeGameweek: { state: "MARKET_OPEN" }, deadlineReached: true },
      { activeGameweek: { state: "LOCKED" }, deadlineReached: false },
    ]) {
      for (const label of accessLabels) assert.equal(render(label, { pt, snapshot: { entitlementActive: true }, ...input }), closed);
    }
    for (const activeGameweek of [null, {}]) {
      const input = { pt, snapshot: { entitlementActive: false }, activeGameweek, deadlineReached: false };
      for (const label of accessLabels) assert.equal(render(label, input), unavailable);
      assert.equal(render(firstStrongIn("myClubMarketStatus"), input), unavailable);
    }
    const footer = firstStrongIn("myClubGameweekFooter");
    const base = { pt, activeGameweek: { state: "MARKET_OPEN" }, deadlineReached: false, validation: { valid: true }, lineupConfirmed: false, selectedCount: 11 };
    assert.equal(render(footer, { ...base, snapshot: { entitlementActive: false } }), viewOnly);
    assert.equal(render(footer, { ...base, snapshot: { entitlementActive: true } }), pt ? "Pronto para confirmar" : "Ready to confirm");
    assert.equal(render(footer, { ...base, snapshot: { entitlementActive: false }, lineupConfirmed: true }), pt ? "XI confirmado" : "XI confirmed");
  });
}

test("copy keeps the existing edit and persistence gates", () => {
  assert.match(source, /const editable = snapshot\?\.entitlementActive === true && activeGameweek\?\.state === "MARKET_OPEN" && !deadlineReached;/);
  assert.match(source, /if \(!activeGameweek \|\| !editable \|\| !selectedCoachId \|\| !formationCode\) return;/);
  assert.match(source, /disabled=\{!editable \|\| saving \|\| !selectedCoachId \|\| !validation\?\.valid \|\| lineupConfirmed\}/);
  assert.doesNotMatch(source, /Modo consulta · mercado fechado|Review mode · market closed/);
});
