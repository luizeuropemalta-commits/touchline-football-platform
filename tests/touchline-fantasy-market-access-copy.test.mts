import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineFantasyMarketWorkflowCopy } from "../lib/touchlineFantasy/market-workflow-i18n.ts";

const catalogueResult = await import("../lib/touchlineFantasy/market-access-i18n.ts").then(
  (value) => ({ value, error: null }), (error: unknown) => ({ value: null, error }),
);
const codes = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    unavailable: "Unavailable", open: "Market Open", closed: "Market Closed", viewOnly: "View only",
    statusAria: "Market status", lineupWindow: "LINEUP WINDOW", manageXI: "Choose a position to manage the XI",
    browseReadOnly: "Browse every club, position and profile. XI changes are unavailable.",
    windowRule: "Closes at the first match kickoff of the round. Reopens after the provider confirms the final whistle of the last match.",
  },
  "pt-BR": {
    unavailable: "Indisponível", open: "Mercado aberto", closed: "Mercado fechado", viewOnly: "Somente consulta",
    statusAria: "Estado do mercado", lineupWindow: "JANELA DE ESCALAÇÃO", manageXI: "Escolha uma posição para gerenciar o XI",
    browseReadOnly: "Consulte todos os clubes, posições e perfis. Alterações no XI não estão disponíveis.",
    windowRule: "Fecha no apito inicial do primeiro jogo da rodada. Reabre após a confirmação do apito final do último jogo pelo provedor.",
  },
};

// Execute the actual presentation expressions, not a second copy of their rules.
// This is bounded JSX coverage, not a mounted component or browser-flow proof.
const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("client.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const elements: ts.JsxElement[] = [];
const declarations: string[] = [];
function visit(node: ts.Node) {
  if (ts.isJsxElement(node)) elements.push(node);
  if (ts.isVariableDeclaration(node) && ["marketAccessCopy", "editable", "marketOpen", "marketStatusLabel", "marketAccessLabel"].includes(node.name.getText(tree))) {
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
function renderMarkup(node: ts.JsxElement, input: Record<string, unknown>) {
  const javascript = ts.transpileModule(`(() => { ${declarations.join("\n")} return (${node.getText(tree)}); })()`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const element = vm.runInNewContext(javascript, {
    React, styles: new Proxy({}, { get: (_target, key) => String(key) }),
    locale: input.pt ? "pt-BR" : "en-GB", draftLocalesEnabled: false, gameweeks: [], marketPage: false,
    getTouchlineFantasyMarketAccessCopy: catalogueResult.value?.getTouchlineFantasyMarketAccessCopy,
    workflowCopy: getTouchlineFantasyMarketWorkflowCopy(typeof input.locale === "string" ? input.locale : input.pt ? "pt-BR" : "en-GB"),
    // The clock has its own real-render tests. Here only its status prop is a seam.
    MarketWindowClock: function ClockBoundary({ marketStatus }: { marketStatus?: string }) {
      return React.createElement("aside", { "data-clock-status": marketStatus });
    },
    ...input,
  });
  return renderToStaticMarkup(element);
}
const render = (node: ts.JsxElement, input: Record<string, unknown>) => renderMarkup(node, input).replace(/<[^>]+>/g, "");

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

test("nine access/window labels cover eight catalogues with exact EN/PT parity and six explicit drafts", () => {
  assert.ifError(catalogueResult.error); const mod = catalogueResult.value!;
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map(locale => locale.code), codes);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_FANTASY_MARKET_ACCESS_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_FANTASY_MARKET_ACCESS_DRAFT_STATUS, "draft");
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(mod.getTouchlineFantasyMarketAccessCopy(locale), baseline[locale]);
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"]));
    for (const text of Object.values(copy)) { assert.ok(text.trim()); assert.doesNotMatch(text, /TODO|FIXME|\{[^}]+\}/); }
    if (locale !== "en-GB" && locale !== "pt-BR") {
      assert.equal(isTouchLineLocaleComplete(locale), false);
      assert.equal(mod.getTouchlineFantasyMarketAccessCopy(locale), mod.TOUCHLINE_FANTASY_MARKET_ACCESS_CATALOGUES["en-GB"]);
      assert.notEqual(copy.browseReadOnly, baseline["en-GB"].browseReadOnly);
    }
  }
});

test("actual complete window section preserves calendar vs permission, read-only text, ARIA and canonical status handoff", () => {
  const section = elements.find(node => hasClass(node, "myClubMarketStatus")); assert.ok(section);
  for (const locale of ["pt-BR", "en-GB"] as const) {
    const expected = baseline[locale];
    for (const marketPage of [false, true]) {
      for (const state of ["MARKET_OPEN", "UPCOMING", "LOCKED", "LIVE", "FINAL", "SETTLED", undefined]) {
        for (const entitlementActive of [true, false, undefined]) {
          for (const deadlineReached of [false, true]) {
            const open = state === "MARKET_OPEN" && !deadlineReached;
            const editable = open && entitlementActive === true;
            const status = state ? (open ? expected.open : expected.closed) : expected.unavailable;
            const html = renderMarkup(section, { locale, pt: locale === "pt-BR", marketPage, snapshot: { entitlementActive }, activeGameweek: state ? { state } : null, deadlineReached });
            assert.ok(html.includes(`data-market-open="${open}"`));
            assert.ok(html.includes(`aria-label="${expected.statusAria}"`));
            assert.ok(html.includes(`<span>${expected.lineupWindow}</span>`));
            assert.ok(html.includes(`<small>${editable ? expected.manageXI : expected.browseReadOnly}</small>`));
            assert.ok(html.includes(`<p class="myClubMarketRule">${expected.windowRule}</p>`));
            if (marketPage) { assert.ok(html.includes(`data-clock-status="${status}"`)); assert.doesNotMatch(html, /<strong>/); }
            else { assert.ok(html.includes(`<strong>${status}</strong>`)); assert.doesNotMatch(html, /data-clock-status=/); }
          }
        }
      }
    }
  }
});

test("actual labels and window section consume the catalogue rather than retaining duplicate inline text", () => {
  assert.match(source, /import \{ getTouchlineFantasyMarketAccessCopy \} from "@\/lib\/touchlineFantasy\/market-access-i18n"/);
  const section = elements.find(node => hasClass(node, "myClubMarketStatus")); assert.ok(section);
  const sentinel = Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `copy:${key}`]));
  const base = { pt: false, locale: "en-GB", snapshot: { entitlementActive: false }, activeGameweek: { state: "MARKET_OPEN" }, deadlineReached: false,
    getTouchlineFantasyMarketAccessCopy: () => sentinel };
  for (const label of accessLabels) assert.equal(render(label, base), "copy:viewOnly");
  assert.equal(render(firstStrongIn("myClubMarketStatus"), base), "copy:open");
  for (const input of [base, { ...base, snapshot: { entitlementActive: true } }, { ...base, deadlineReached: true }, { ...base, activeGameweek: null }]) {
    const html = renderMarkup(section, input);
    assert.match(html, /aria-label="copy:statusAria"/); assert.match(html, /copy:lineupWindow/); assert.match(html, /copy:windowRule/);
    assert.doesNotMatch(html, /LINEUP WINDOW|JANELA DE ESCALAÇÃO|Choose a position|Browse every club/);
  }
  assert.match(renderMarkup(section, { ...base, snapshot: { entitlementActive: true } }), /copy:manageXI/);
  assert.match(renderMarkup(section, base), /copy:browseReadOnly/);
  assert.equal(render(firstStrongIn("myClubMarketStatus"), { ...base, deadlineReached: true }), "copy:closed");
  assert.equal(render(firstStrongIn("myClubMarketStatus"), { ...base, activeGameweek: null }), "copy:unavailable");
});

test("draft/invalid locales keep actual window and access labels in English until public release gates open", () => {
  assert.ifError(catalogueResult.error);
  const section = elements.find(node => hasClass(node, "myClubMarketStatus")); assert.ok(section);
  const base = { pt: false, snapshot: { entitlementActive: false }, activeGameweek: { state: "MARKET_OPEN" }, deadlineReached: false };
  const english = renderMarkup(section, { ...base, locale: "en-GB" });
  for (const locale of [...codes.slice(2), "", "invalid"]) {
    assert.equal(renderMarkup(section, { ...base, locale }), english);
    for (const label of accessLabels) assert.equal(render(label, { ...base, locale }), "View only");
  }
});
