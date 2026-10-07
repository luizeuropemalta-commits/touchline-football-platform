import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { TOUCHLINE_APPROVED_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { formatTouchlineFantasyMarketValue } from "../lib/touchlineFantasy/domain.ts";

const load = () => import("../lib/touchlineFantasy/market-metrics-i18n.ts");
const codes = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const baseline = {
  "en-GB": {
    summaryAria: "Your XI summary", remainingBudget: "XI budget remaining", roundPoints: "Gameweek points",
    roundPointsAria: "Gameweek points — open rankings", seasonPoints: "Season points", seasonPointsAria: "Season points — open rankings",
  },
  "pt-BR": {
    summaryAria: "Resumo do seu XI", remainingBudget: "Orçamento restante do XI", roundPoints: "Pontos da rodada",
    roundPointsAria: "Pontos da rodada — abrir ranking", seasonPoints: "Pontos da temporada", seasonPointsAria: "Pontos da temporada — abrir ranking",
  },
};

test("metrics catalogue contains exactly six presentation keys and eight approved locales", async () => {
  const mod = await load();
  assert.deepEqual(TOUCHLINE_APPROVED_LOCALES.map(locale => locale.code), codes);
  assert.deepEqual(Object.keys(mod.TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES), codes);
  assert.deepEqual(mod.TOUCHLINE_FANTASY_MARKET_METRICS_DRAFT_LOCALES, codes.slice(2));
  assert.equal(mod.TOUCHLINE_FANTASY_MARKET_METRICS_DRAFT_STATUS, "draft");
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), Object.keys(baseline["en-GB"]));
    for (const text of Object.values(copy)) {
      assert.equal(typeof text, "string"); assert.ok(text.trim());
      assert.doesNotMatch(text, /TODO|FIXME|\{[^}]+\}/);
    }
    if (locale !== "en-GB" && locale !== "pt-BR") assert.notEqual(copy.roundPoints, baseline["en-GB"].roundPoints);
  }
});

test("live metrics labels preserve exact approved EN/PT wording and XI identity", async () => {
  const mod = await load();
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(mod.getTouchlineFantasyMarketMetricsCopy(locale), baseline[locale]);
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES[locale];
    assert.match(copy.summaryAria, /\bXI\b/);
    assert.match(copy.remainingBudget, /\bXI\b/);
  }
});

test("six additional metric catalogues remain drafts and cannot bypass the public locale gate", async () => {
  const mod = await load();
  for (const locale of [...codes.slice(2), null, undefined, "", "unknown", "fr", "constructor", "__proto__"]) {
    assert.equal(mod.getTouchlineFantasyMarketMetricsCopy(locale), mod.TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES["en-GB"]);
  }
  for (const locale of codes.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("metrics catalogue has no account facts, monetary values, brands renamed or payment concepts", async () => {
  const mod = await load();
  for (const locale of codes) {
    const copy = mod.TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES[locale];
    const labels = Object.values(copy).join(" ");
    // Numbers, prices, URLs and facts belong to the existing real consumer.
    assert.doesNotMatch(labels, /[0-9٠-٩€£$]|https?:|checkout|Stripe|wallet|saldo|crédit|credit|pagament|payment|subscription/i);
    // This namespace only labels metrics; no product name/identity is authored.
    assert.doesNotMatch(labels, /TouchLine|ClubOwner|ClubHub|TouchLineVerified|Market Transfer/);
  }
  assert.match(mod.TOUCHLINE_FANTASY_MARKET_METRICS_CATALOGUES["ar-SA"].roundPoints, /[\u0600-\u06ff]/);
});

// Extract the existing dl and its real conditional/getter, not another copy of
// its rendering rules. Only Next Link is replaced at the framework boundary.
function consumer() {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("Fantasy.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let metrics: ts.JsxElement | undefined;
  const declarations: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "marketMetricsCopy") declarations.push(`const ${node.getText(ast)};`);
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "dl" && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "data-market-owner-metrics")) metrics = node;
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(metrics); assert.ok(ts.isConditionalExpression(metrics.parent));
  const javascript = ts.transpileModule(`(() => { ${declarations.join("\n")} return (${metrics.parent.getText(ast)}); })()`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return {
    source,
    render(input: Record<string, unknown>, getCopy: (locale: string) => unknown) {
      const element = runInNewContext(javascript, {
        React, styles: { ownerSummary: "ownerSummary" }, formatTouchlineFantasyMarketValue,
        marketPage: true, locale: "en-GB", draftLocalesEnabled: false, pt: false, live: null, validation: null,
        snapshot: { config: { budgetEur: 900_000_000 }, gameweekScore: 12.34, seasonScore: 98.76 },
        getTouchlineFantasyMarketMetricsCopy: getCopy,
        Link: function LinkBoundary(props: React.ComponentProps<"a">) { return React.createElement("a", props); },
        ...input,
      });
      return renderToStaticMarkup(element);
    },
  };
}

test("actual metrics JSX uses all six catalogue fields without duplicating bilingual copy", async () => {
  const actual = consumer();
  const sentinels = Object.fromEntries(Object.keys(baseline["en-GB"]).map(key => [key, `catalogue:${key}`]));
  const locales: string[] = [];
  const html = actual.render({ locale: "pt-BR", pt: true }, (locale) => { locales.push(locale); return sentinels; });
  assert.deepEqual(locales, ["pt-BR"]);
  assert.match(actual.source, /import \{ getTouchlineFantasyMarketMetricsCopy \} from "@\/lib\/touchlineFantasy\/market-metrics-i18n"/);
  for (const text of Object.values(sentinels)) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Resumo do seu XI|Pontos da rodada|Orçamento restante|Gameweek points|Season points/);
});

test("actual metrics JSX preserves EN/PT labels, three values, two encoded ranking links and market-only display", async () => {
  const mod = await load(); const actual = consumer();
  for (const locale of ["en-GB", "pt-BR"] as const) {
    const expected = baseline[locale];
    const html = actual.render({ locale, pt: locale === "pt-BR" }, mod.getTouchlineFantasyMarketMetricsCopy);
    assert.ok(html.startsWith(`<dl class="ownerSummary" data-market-owner-metrics="true" aria-label="${expected.summaryAria}">`));
    assert.equal((html.match(/<div>/g) ?? []).length, 3);
    assert.ok(html.includes(`<dt>${expected.remainingBudget}</dt><dd>${formatTouchlineFantasyMarketValue(900_000_000, locale)}</dd>`));
    assert.ok(html.includes(`<dt>${expected.roundPoints}</dt>`)); assert.ok(html.includes(`<dt>${expected.seasonPoints}</dt>`));
    assert.ok(html.includes(`<a href="/rankings?lang=${locale}" aria-label="${expected.roundPointsAria}">12.34</a>`));
    assert.ok(html.includes(`<a href="/rankings?lang=${locale}" aria-label="${expected.seasonPointsAria}">98.76</a>`));
    assert.equal((html.match(/<a /g) ?? []).length, 2);
    assert.doesNotMatch(html, /<button|<input|<form|data-bank/);
    assert.equal(actual.render({ locale, pt: locale === "pt-BR", marketPage: false }, mod.getTouchlineFantasyMarketMetricsCopy), "");
  }
});

test("real metrics preserve live zero, nullish snapshot fallback and remaining-budget zero without mutating data", async () => {
  const mod = await load(); const actual = consumer();
  const scenarios = [
    { live: { gameweekScore: 0, seasonScore: 0 }, validation: { budgetRemainingEur: 0 }, expected: [0, 0, 0] },
    { live: { gameweekScore: null, seasonScore: undefined }, validation: { budgetRemainingEur: null }, expected: [900_000_000, 12.34, 98.76] },
    { live: { gameweekScore: -1.25, seasonScore: 234.567 }, validation: { budgetRemainingEur: 123_000_000 }, expected: [123_000_000, -1.25, 234.57] },
    { live: null, validation: null, expected: [900_000_000, 12.34, 98.76] },
  ];
  for (const locale of ["en-GB", "pt-BR"] as const) {
    for (const scenario of scenarios) {
      const input = { locale, pt: locale === "pt-BR", live: scenario.live, validation: scenario.validation };
      const before = JSON.stringify(input); const html = actual.render(input, mod.getTouchlineFantasyMarketMetricsCopy);
      assert.ok(html.includes(`<dd>${formatTouchlineFantasyMarketValue(scenario.expected[0], locale)}</dd>`));
      const scores = [...html.matchAll(/<a [^>]+>([^<]+)<\/a>/g)].map(match => match[1]);
      assert.deepEqual(scores, scenario.expected.slice(1).map(value => value.toFixed(2)));
      assert.equal(JSON.stringify(input), before);
    }
    const zeroSnapshot = actual.render({ locale, pt: locale === "pt-BR", snapshot: { config: { budgetEur: 0 }, gameweekScore: 0, seasonScore: 0 } }, mod.getTouchlineFantasyMarketMetricsCopy);
    assert.ok(zeroSnapshot.includes(`<dd>${formatTouchlineFantasyMarketValue(0, locale)}</dd>`));
    assert.equal((zeroSnapshot.match(/>0\.00<\/a>/g) ?? []).length, 2);
  }
});

test("actual metrics keep six draft locales gated and encode locale handoff without changing link destinations", async () => {
  const mod = await load(); const actual = consumer();
  for (const locale of [...codes.slice(2), "", 'en-GB&redirect=https://example.invalid/"']) {
    const html = actual.render({ locale, pt: false }, mod.getTouchlineFantasyMarketMetricsCopy);
    for (const text of Object.values(baseline["en-GB"])) assert.ok(html.includes(text));
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(links, Array(2).fill(`/rankings?lang=${encodeURIComponent(locale)}`));
    assert.doesNotMatch(html, /href="https?:|redirect="|onclick=/i);
  }
});
