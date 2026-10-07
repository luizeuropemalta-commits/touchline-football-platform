import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as domain from "../lib/touchlineFantasy/domain.ts";
import { isTouchLineLocaleComplete, normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";
import { getTouchlineFantasyMarketClockCopy, formatTouchlineFantasyClockUnit } from "../lib/touchlineFantasy/market-clock-i18n.ts";
import { getTouchlineFantasyMarketMetricsCopy } from "../lib/touchlineFantasy/market-metrics-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX };
const source = readFileSync(new URL("../lib/touchlineFantasy/domain.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: options }).outputText;
type DateCall = { locale: string; options: Intl.DateTimeFormatOptions; date: Date; resolved: Intl.ResolvedDateTimeFormatOptions };
type NumberCall = { locale: string; options: Intl.NumberFormatOptions; value: number; resolved: Intl.ResolvedNumberFormatOptions };

// Full domain module and native Intl, with a test-only normalizer seam for
// future admitted locales. Record inputs/options without replacing formatting.
// No public language gate, process TZ or global Intl object is modified.
function fixture(review = false) {
  const dates: DateCall[] = [], numbers: NumberCall[] = [], requested: unknown[] = [];
  const exports: typeof domain = {} as typeof domain;
  runInNewContext(javascript, {
    exports,
    require: (name: string) => {
      assert.equal(name, "../touchlineArena/catalogue-locale.ts");
      return { resolveTouchlineCatalogueLocale: (locale: string, enabled = false) => { requested.push(locale); return resolveTouchlineCatalogueLocale(locale, enabled); } };
    },
    Intl: {
      DateTimeFormat: function (locale: string, options: Intl.DateTimeFormatOptions) {
        const native = new Intl.DateTimeFormat(locale, options);
        return { format(date: Date) { dates.push({ locale, options, date, resolved: native.resolvedOptions() }); return native.format(date); } };
      },
      NumberFormat: function (locale: string, options: Intl.NumberFormatOptions) {
        const native = new Intl.NumberFormat(locale, options);
        return { format(value: number) { numbers.push({ locale, options, value, resolved: native.resolvedOptions() }); return native.format(value); } };
      },
    },
  });
  const api = { ...exports,
    formatTouchlineFantasyDeadline: (value: string, locale: string) => exports.formatTouchlineFantasyDeadline(value, locale, review),
    formatTouchlineFantasyMarketValue: (value: number, locale: string) => exports.formatTouchlineFantasyMarketValue(value, locale, review),
  };
  return { api, dates, numbers, requested };
}

const values = [0, -1, -1_250_000, 1_250_000, 9_999_999, 10_000_000, 12_345_678, 900_000_000, NaN, Infinity, -Infinity];
// Captured from the unchanged EN/PT functions before the slice. Keep NBSPs
// explicit: compact EUR formatting is presentation, not a numeric conversion.
const budgets = {
  "en-GB": ["€0", "-€1", "-€1.25m", "€1.25m", "€10m", "€10m", "€12.3m", "€900m", "€NaN", "€∞", "-€∞"],
  "pt-BR": ["€\u00a00", "-€\u00a01", "-€\u00a01,25\u00a0mi", "€\u00a01,25\u00a0mi", "€\u00a010\u00a0mi", "€\u00a010\u00a0mi", "€\u00a012,3\u00a0mi", "€\u00a0900\u00a0mi", "€\u00a0NaN", "€\u00a0∞", "-€\u00a0∞"],
};

test("public EN/PT deadline and EUR compact baselines remain exact, including nonfinite/negative values", () => {
  assert.equal(domain.formatTouchlineFantasyDeadline("2026-08-21T19:55:00.000Z", "en-GB"), "21 Aug 2026, 20:55");
  assert.equal(domain.formatTouchlineFantasyDeadline("2026-08-21T19:55:00.000Z", "pt-BR"), "21 de ago. de 2026, 20:55");
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(values.map((value) => domain.formatTouchlineFantasyMarketValue(value, locale)), budgets[locale]);
  assert.equal(domain.TOUCHLINE_FANTASY_INITIAL_BUDGET_EUR, 900_000_000);
  assert.equal(domain.TOUCHLINE_FANTASY_SUBSCRIPTION_CURRENCY, "GBP");
  assert.equal(domain.TOUCHLINE_FANTASY_SUBSCRIPTION_PRICE_MINOR, 2_990);
});

test("both formatters delegate the entire locale to the existing gate; six drafts and malformed locales stay English", () => {
  const actual = fixture();
  for (const locale of [...locales, "", "invalid_locale", "en-GB-u-ca-islamic", "pt"]) {
    actual.requested.length = 0;
    const deadline = actual.api.formatTouchlineFantasyDeadline("2026-08-21T19:55:00Z", locale);
    const budget = actual.api.formatTouchlineFantasyMarketValue(900_000_000, locale);
    assert.deepEqual(actual.requested, [locale, locale]);
    assert.equal(deadline, locale === "pt-BR" ? "21 de ago. de 2026, 20:55" : "21 Aug 2026, 20:55");
    assert.equal(budget, budgets[locale === "pt-BR" ? "pt-BR" : "en-GB"][7]);
    assert.equal(domain.formatTouchlineFantasyDeadline("2026-08-21T19:55:00Z", locale), deadline);
    assert.equal(domain.formatTouchlineFantasyMarketValue(900_000_000, locale), budget);
  }
  for (const locale of locales.slice(2)) assert.equal(isTouchLineLocaleComplete(locale), false);
});

test("all eight review locales reach native Intl while London, Gregorian date, 24h time and exact instant stay authoritative", () => {
  const actual = fixture(true);
  const instant = "2026-08-21T19:55:00.000Z";
  for (const locale of locales) {
    actual.dates.length = 0;
    actual.api.formatTouchlineFantasyDeadline(instant, locale);
    assert.equal(actual.dates.length, 2);
    for (const call of actual.dates) {
      assert.equal(call.locale, locale);
      assert.equal(call.date.getTime(), Date.parse(instant));
      assert.equal(call.options.timeZone, "Europe/London");
      assert.equal(call.options.calendar, "gregory");
      assert.equal(call.resolved.calendar, "gregory");
    }
    assert.equal(actual.dates[0].options.dateStyle, "medium");
    assert.equal(actual.dates[1].options.hour12, false);
    assert.equal(actual.dates[1].resolved.hour12, false);
    const parts = new Intl.DateTimeFormat(locale, actual.dates[0].options).formatToParts(Date.parse(instant));
    assert.equal(parts.find((part) => part.type === "year")?.value, new Intl.NumberFormat(locale, { useGrouping: false }).format(2026));
  }
});

test("winter/summer, both DST boundaries, midnight and explicit-offset equivalent instants preserve London civil time", () => {
  const cases = [
    ["2026-01-15T20:55:00Z", "15 Jan 2026, 20:55"],
    ["2026-08-21T19:55:00Z", "21 Aug 2026, 20:55"],
    ["2026-03-29T00:30:00Z", "29 Mar 2026, 00:30"],
    ["2026-03-29T01:30:00Z", "29 Mar 2026, 02:30"],
    ["2026-10-25T00:30:00Z", "25 Oct 2026, 01:30"],
    ["2026-10-25T01:30:00Z", "25 Oct 2026, 01:30"],
    ["2026-08-21T23:00:00Z", "22 Aug 2026, 00:00"],
  ];
  for (const [instant, expected] of cases) assert.equal(domain.formatTouchlineFantasyDeadline(instant, "en-GB"), expected);
  for (const locale of locales) {
    const actual = fixture(true);
    assert.equal(actual.api.formatTouchlineFantasyDeadline("2026-08-21T19:55:00Z", locale), actual.api.formatTouchlineFantasyDeadline("2026-08-21T21:55:00+02:00", locale));
    for (const invalid of ["", "invalid", "2026-99-99T99:99:99Z"]) {
      actual.dates.length = 0;
      assert.equal(actual.api.formatTouchlineFantasyDeadline(invalid, locale), "—");
      assert.equal(actual.dates.length, 0);
    }
  }
});

test("all eight review budgets preserve EUR, original numbers, compact precision threshold and native error-value presentation", () => {
  const actual = fixture(true);
  for (const locale of locales) for (const [value, precision] of [[0, 2], [-1_250_000, 2], [9_999_999, 2], [10_000_000, 1], [900_000_000, 1], [NaN, 1], [Infinity, 1], [-Infinity, 2]]) {
    actual.numbers.length = 0;
    const output = actual.api.formatTouchlineFantasyMarketValue(value, locale);
    const [call] = actual.numbers;
    assert.equal(actual.numbers.length, 1);
    assert.equal(call.locale, locale); assert.ok(Object.is(call.value, value));
    assert.equal(call.options.currency, "EUR"); assert.equal(call.resolved.currency, "EUR");
    assert.equal(call.options.style, "currency"); assert.equal(call.options.notation, "compact");
    assert.equal(call.options.maximumFractionDigits, precision);
    assert.equal(output, new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: precision }).format(value));
  }
});

const clientSource = ts.createSourceFile("Fantasy.tsx", readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const clockNode = clientSource.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "MarketWindowClock");
assert.ok(clockNode);
let metricsNode: ts.JsxElement | undefined;
function visit(node: ts.Node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(clientSource) === "dl" && node.openingElement.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(clientSource) === "data-market-owner-metrics")) metricsNode = node;
  ts.forEachChild(node, visit);
}
visit(clientSource); assert.ok(metricsNode);
const clockJavaScript = ts.transpileModule(`${clockNode.getText(clientSource)}\nexport { MarketWindowClock };`, { compilerOptions: options }).outputText;
const metricsJavaScript = ts.transpileModule(`export const metrics = (${metricsNode.getText(clientSource)});`, { compilerOptions: options }).outputText;
function renderConsumers(api: typeof domain, locale: string, remaining: number | null) {
  const exports: Record<string, unknown> = {};
  const snapshot = { config: { budgetEur: 900_000_000 }, gameweekScore: 0, seasonScore: 12.34 };
  const validation = { budgetRemainingEur: remaining };
  const before = JSON.stringify({ snapshot, validation });
  const clock = { number: 1, state: "MARKET_OPEN", marketOpensAt: "2026-08-01T00:00:00Z", locksAt: "2026-08-21T19:55:00Z" };
  const context = {
    exports, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
    ...api, locale, snapshot, validation, live: null, draftLocalesEnabled: false,
    marketMetricsCopy: getTouchlineFantasyMarketMetricsCopy(locale), getTouchlineFantasyMarketClockCopy, formatTouchlineFantasyClockUnit,
    useState: () => [Date.parse("2026-08-21T19:00:00Z"), () => {}], useMemo: (callback: () => unknown) => callback(), useEffect: () => {},
    TimerReset: () => null, styles: new Proxy({}, { get: (_, key) => String(key) }),
    Link: (props: React.ComponentProps<"a">) => React.createElement("a", props),
  };
  runInNewContext(clockJavaScript, { ...context });
  runInNewContext(metricsJavaScript, { ...context });
  const html = renderToStaticMarkup(React.createElement(exports.MarketWindowClock as React.ComponentType<object>, { locale, gameweeks: [clock] }))
    + renderToStaticMarkup(exports.metrics as React.ReactElement);
  assert.equal(JSON.stringify({ snapshot, validation }), before);
  return html;
}

test("actual clock and budget JSX consume real formatters, preserving timestamp, zero/null fallback, links and public gates", () => {
  for (const review of [false, true]) for (const locale of locales) for (const remaining of [0, null, -1_250_000]) {
    const actual = fixture(review);
    const html = renderConsumers(actual.api, locale, remaining);
    const expectedLocale = review ? locale : normalizeTouchLineLocale(locale);
    assert.ok(actual.dates.length > 0 && actual.dates.every((call) => call.locale === expectedLocale));
    assert.equal(actual.numbers.length, 1);
    assert.equal(actual.numbers[0].locale, expectedLocale);
    assert.equal(actual.numbers[0].value, remaining ?? 900_000_000);
    assert.ok(html.includes('dateTime="2026-08-21T19:55:00Z"'));
    assert.ok(html.includes(`href="/rankings?lang=${locale}"`));
    assert.ok(html.includes('>0.00</a>')); assert.ok(html.includes('>12.34</a>'));
    assert.ok(html.includes(actual.api.formatTouchlineFantasyDeadline("2026-08-21T19:55:00Z", locale)));
    assert.ok(html.includes(actual.api.formatTouchlineFantasyMarketValue(remaining ?? 900_000_000, locale)));
  }
});
