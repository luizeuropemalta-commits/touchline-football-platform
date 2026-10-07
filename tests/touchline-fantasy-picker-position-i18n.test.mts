import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { localizedPositionLabel } from "../lib/touchlineArena/position-labels.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";
import { touchlineCardTierPalette } from "../lib/touchlineArena/card-rules.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";

const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("FantasyGameweekClient.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let results = "";
function visit(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attribute =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "id"
    && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "my-club-position-results")) results = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(results, "extract the actual picker results, never a replica");
const compiled = ts.transpileModule(`(${results})`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
type Element = React.ReactElement<Record<string, unknown>>;
function nodes(value: React.ReactNode): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children as React.ReactNode)];
}
function CardBoundary({ card }: { card: { position?: string | null; role: string; id: string } }) {
  return React.createElement("i", { "data-raw-position": card.position, "data-role": card.role, "data-id": card.id });
}
function TraceBoundary() { return null; }
function actual(position: string | null | undefined, locale: string, overrides: Record<string, unknown> = {}, helper = localizedPositionLabel) {
  const card = Object.freeze({ id: "raw-id", canonicalPlayerId: "canonical-id", position, role: "goalkeeper", name: 'Canonical <Player> & "Name"', clubName: "Club <Original> & Co", editorialCard: Object.freeze({ tierKey: "radiant-gold" }) });
  const selected: unknown[] = [];
  const context = {
    React, locale, draftLocalesEnabled: false, browseCards: [card], marketPage: true, activeSlot: { id: "GK" }, browseSlot: { id: "GK" },
    selections: [], editable: true, saving: false, selectedCoach: { id: "coach-id" }, marketAccessLabel: "LOCKED",
    workflowCopy: getTouchlineFantasyMarketWorkflowCopy(locale), localizedPositionLabel: helper, touchlineCardTierPalette,
    styles: { marketClosedLabel: "marketClosedLabel", myClubMarketResults: "myClubMarketResults" },
    TouchlineGameweekCard: CardBoundary, TouchlineClubPerimeterTrace: TraceBoundary,
    selectMyClubPlayer: (value: unknown) => selected.push(value), ...overrides,
  };
  const element = runInNewContext(compiled, context) as Element;
  return { element, card, selected, context, all: nodes(element), html: renderToStaticMarkup(element) };
}
function positionText(view: ReturnType<typeof actual>) {
  return view.all.find(node => node.type === "small")?.props.children;
}

test("actual picker preserves EN spelling and renders existing Portuguese aliases without changing raw card data", () => {
  for (const [raw, translated] of [["Goalkeeper", "Goleiro"], ["GK", "Goleiro"], ["Centre-Back", "Zagueiro"], ["ST", "Centroavante"], ["RWB", "Ala direito"]]) {
    for (const [locale, expected] of [["en-GB", raw], ["pt-BR", translated]]) {
      const view = actual(raw, locale);
      assert.equal(positionText(view), expected);
      assert.equal(view.card.position, raw);
      const child = view.all.find(node => node.type === CardBoundary)!;
      assert.equal(child.props.card, view.card);
      assert.equal(child.props.locale, locale);
      assert.equal(child.props.displayWidth, 126);
      assert.equal(child.props.fitContainer, true);
      assert.ok(view.html.includes('data-role="goalkeeper"'));
      assert.ok(view.html.includes(`data-raw-position="${raw}"`));
      assert.ok(view.html.includes('Canonical &lt;Player&gt; &amp; &quot;Name&quot;'));
      assert.ok(view.html.includes('Club &lt;Original&gt; &amp; Co'));
      const article = view.all.find(node => node.type === "article")!;
      assert.equal(article.key, "canonical-id");
      assert.equal(article.props["data-market-tier-frame"], "radiant-gold");
      assert.deepEqual(JSON.parse(JSON.stringify(article.props.style)), { "--tier-accent": touchlineCardTierPalette("radiant-gold").accent });
    }
  }
});

test("six unpublished locales remain gated, and null, empty and unknown provider positions stay unchanged", () => {
  for (const locale of ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
    assert.equal(isTouchLineLocaleComplete(locale), false);
    assert.equal(positionText(actual("GK", locale)), "GK");
  }
  for (const locale of ["en-GB", "pt-BR", "ar-SA", "unknown"]) for (const raw of [null, undefined, "", "Unknown provider role", "constructor", "__proto__"]) {
    assert.equal(positionText(actual(raw, locale)), raw);
  }
});

test("actual JSX forwards complete locale and original position to the real helper under an isolated future gate", () => {
  const helperSource = readFileSync(new URL("../lib/touchlineArena/position-labels.ts", import.meta.url), "utf8");
  const exports: Record<string, unknown> = {};
  const seen: string[] = [];
  runInNewContext(ts.transpileModule(helperSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require(name: string) { assert.equal(name, "./catalogue-locale.ts"); return { resolveTouchlineCatalogueLocale(locale: string, enabled = false) { seen.push(locale); return catalogueLocale.resolveTouchlineCatalogueLocale(locale, enabled); } }; },
  });
  const helper = exports.localizedPositionLabel as typeof localizedPositionLabel;
  for (const [locale, expected] of [["en-GB", "GK"], ["pt-BR", "Goleiro"], ["es-ES", "Portero"], ["it-IT", "Portiere"], ["fr-FR", "Gardien de but"], ["ar-SA", "حارس مرمى"], ["tr-TR", "Kaleci"], ["de-DE", "Torwart"]]) {
    assert.equal(positionText(actual("GK", locale, { draftLocalesEnabled: true }, helper)), expected);
    assert.equal(seen.at(-1), locale);
  }
});

test("real picker action branches preserve choose/swap, locks, disabled saving, raw click arguments and empty state", () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    const copy = getTouchlineFantasyMarketWorkflowCopy(locale);
    for (const swap of [false, true]) for (const saving of [false, true]) {
      const view = actual("GK", locale, { saving, selections: swap ? [{ slotId: "GK", playerId: "old-id" }] : [] });
      const button = view.all.find(node => node.type === "button")!;
      assert.ok(button);
      assert.equal(button.props.disabled, saving);
      assert.equal(button.props.type, "button");
      assert.equal(button.props.children, `${swap ? copy.replaceSlot : copy.chooseSlot} · GK`);
      assert.equal(view.selected.length, 0, "rendering must not select");
      if (!saving) {
        (button.props.onClick as () => void)();
        assert.deepEqual(view.selected, [view.card]);
        assert.equal(view.selected[0], view.card);
        assert.equal(view.card.position, "GK");
      }
    }
    for (const [input, label] of [
      [{ editable: false }, "LOCKED"],
      [{ selections: [{ slotId: "GK", playerId: "canonical-id" }] }, copy.inYourXI],
      [{ selectedCoach: null }, copy.reviewOnly],
      [{ activeSlot: null }, copy.reviewOnly],
      [{ marketPage: false, browseSlot: { id: "ST" } }, copy.reviewOnly],
    ] as const) {
      const view = actual("GK", locale, input);
      assert.equal(view.all.some(node => node.type === "button"), false);
      assert.ok(view.html.includes(label));
      assert.equal(view.selected.length, 0);
    }
    const empty = actual("GK", locale, { browseCards: [] });
    assert.equal(empty.all.some(node => node.type === "article"), false);
    assert.ok(empty.html.includes(copy.noCards));
  }
});
