import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as appearance from "../lib/touchlineArena/player-appearance-presentation.ts";
import { normalizeTouchLineLocale, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineCardZoomCopy } from "../lib/touchlineArena/card-zoom-i18n.ts";
import { getTouchlineCardMatchFactLabels } from "../lib/touchlineArena/card-match-fact-i18n.ts";
import { getTouchlineExactCardCopy } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlinePlayerPerformanceCopy } from "../lib/touchlineArena/player-performance-i18n.ts";
import { formatTouchlineProfileTimestamp } from "../lib/touchlineArena/profile-timestamp.ts";

// Real server policy in an isolated environment; never inherit the host flag.
const releaseEnv: Record<string, string | undefined> = {};
const releasePolicy: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/site-locales-release.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: releasePolicy, process: { env: releaseEnv } });


const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const statuses = ["started", "substitute", "unused", "absent", "unavailable"] as const;
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX };
const pageSource = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
const page = ts.createSourceFile("profile.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes(predicate: (node: ts.Node) => boolean, scope: ts.Node = page) {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); node.forEachChild(visit); };
  visit(scope); return found;
}
const routes = page.statements.filter((statement): statement is ts.FunctionDeclaration =>
  ts.isFunctionDeclaration(statement)
  && Boolean(statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)),
);
assert.equal(routes.length, 1, "inspect the actual default-exported route");
const wrapperReturn = routes[0].body?.statements.find(ts.isReturnStatement)?.expression;
assert.ok(wrapperReturn && ts.isCallExpression(wrapperReturn));
assert.equal(wrapperReturn.expression.getText(), "renderPlayerProfilePage");
assert.equal(wrapperReturn.arguments[1]?.getText(), 'isTouchLineSiteLocalesEnabled("/touchline-players/[player]")');
const renderer = page.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "renderPlayerProfilePage");
assert.equal(renderer?.parameters[1]?.initializer?.kind, ts.SyntaxKind.FalseKeyword);
const routeBody = renderer?.body;
assert.ok(routeBody);
function initializer(name: string, scope: ts.Node = page) {
  const found = nodes(node => ts.isVariableDeclaration(node) && node.name.getText(page) === name, scope) as ts.VariableDeclaration[];
  assert.equal(found.length, 1, name); return found[0].initializer!.getText(page);
}
const profileCopyFunction = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === "getTouchlinePlayerProfileCopy")[0];
assert.ok(profileCopyFunction);
function evaluate(source: string, context: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const js = ts.transpileModule(`export const result = (${source});`, { compilerOptions: options }).outputText;
  runInNewContext(js, { ...context, exports, require: (name: string) => { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; } });
  return exports.result;
}
function profileCopyHelper() {
  const exports: Record<string, unknown> = {};
  const source = [
    `const copy = ${initializer("copy")};`,
    `const profileChromeDrafts = ${initializer("profileChromeDrafts")};`,
    profileCopyFunction.getText(page),
    "export { getTouchlinePlayerProfileCopy };",
  ].join("\n");
  runInNewContext(ts.transpileModule(source, { compilerOptions: options }).outputText, {
    exports,
    normalizeTouchLineLocale,
    resolveTouchlineCatalogueLocale,
  });
  return exports as { getTouchlinePlayerProfileCopy: (locale?: string | null, draftLocalesEnabled?: boolean) => Record<string, string> };
}
const expected = {
  "en-GB": ["Started", "Substitute", "Unused", "Participation unconfirmed", "Unavailable", "Source: TouchLine · coverage varies by match"],
  "pt-BR": ["Titular", "Substituto", "Não utilizado", "Participação não confirmada", "Indisponível", "Fonte: TouchLine · cobertura por partida"],
};

test("six texts preserve EN/PT exactly; eight complete draft catalogues do not open six locale gates", () => {
  const exported = appearance as unknown as Record<string, unknown>;
  const catalogues = exported.TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES as Record<string, Record<string, string>>;
  assert.ok(catalogues);
  assert.deepEqual(Object.keys(catalogues), locales);
  assert.deepEqual(exported.TOUCHLINE_PLAYER_APPEARANCE_DRAFT_LOCALES, locales.slice(2));
  assert.equal(exported.TOUCHLINE_PLAYER_APPEARANCE_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const copy = catalogues[locale];
    assert.deepEqual(Object.keys(copy), [...statuses, "source"]);
    assert.ok(Object.values(copy).every(value => typeof value === "string" && value.trim()));
    assert.match(copy.source, /TouchLine/);
    if (locale === "en-GB" || locale === "pt-BR") assert.deepEqual(Object.values(copy), expected[locale]);
    else { assert.equal(isTouchLineLocaleComplete(locale), false); assert.equal(normalizeTouchLineLocale(locale), "en-GB"); }
  }
});

test("approved EN/PT and null statuses retain meanings; noncanonical pt aliases deliberately fall back to English", () => {
  for (const locale of [...locales, "en", "pt", "pt-PT", "PT-BR", "pt-anything", "", "invalid_locale"]) {
    const baseline = expected[locale === "pt-BR" ? "pt-BR" : "en-GB"];
    assert.deepEqual(statuses.map(status => appearance.touchlinePlayerAppearanceLabel(status, locale)), baseline.slice(0, 5));
    assert.equal(appearance.touchlinePlayerAppearanceLabel(null, locale), baseline[4]);
    assert.equal(appearance.touchlinePlayerAppearanceLabel(undefined, locale), baseline[4]);
    assert.equal(appearance.touchlinePlayerDataSourceLabel(locale), baseline[5]);
  }
});

test("both real helper APIs expose eight catalogues only through explicit opt-in", () => {
  const catalogues = (appearance as unknown as { TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES: Record<string, Record<string, string>> }).TOUCHLINE_PLAYER_APPEARANCE_CATALOGUES;
  for (const locale of locales) {
    const values = statuses.map(status => appearance.touchlinePlayerAppearanceLabel(status, locale, true));
    const source = appearance.touchlinePlayerDataSourceLabel(locale, true);
    assert.deepEqual(values, statuses.map(status => catalogues[locale][status]));
    assert.equal(source, catalogues[locale].source);
  }
});

function profileContext(locale: typeof locales[number], review = false, sentinel = false) {
  const api = appearance;
  const profileCopy = profileCopyHelper();
  const zoom = getTouchlineCardZoomCopy(locale, review);
  const facts = getTouchlineCardMatchFactLabels(locale, review);
  const context: Record<string, unknown> = {
    locale, draftLocalesEnabled: review, copy: evaluate(initializer("copy"), {}), exactCopy: getTouchlineExactCardCopy(locale, review),
    zoomCopy: { ...zoom, ...(sentinel ? { history: "SENTINEL_HISTORY" } : {}) },
    matchFactLabels: { ...facts, ...(sentinel ? { minutes: "SENTINEL_MINUTES", rating: "SENTINEL_RATING" } : {}) },
    touchlinePlayerAppearanceLabel: api.touchlinePlayerAppearanceLabel,
    getTouchlinePlayerProfileCopy: profileCopy.getTouchlinePlayerProfileCopy,
    getTouchlinePlayerPerformanceCopy,
    formatOfficialSyncTime: formatTouchlineProfileTimestamp,
    styles: new Proxy({}, { get: (_, key) => String(key) }),
    buildTouchlineVerifiedMatchFactFields: () => [], // Current-facts builder is outside this copy slice.
  };
  context.text = evaluate(initializer("text", routeBody), context);
  return { context, api, text: context.text as Record<string, string> };
}
const fixtureFunction = nodes(node => ts.isFunctionDeclaration(node) && node.name?.text === "FixtureStatisticsPanel")[0];
assert.ok(fixtureFunction);
const fixtures = [
  { fixtureId: "fixture-zero", appearanceStatus: "started", minutes: 0, rating: 0, fixtureStartsAt: "2026-09-20T13:00:00Z", name: "Official $& Name", href: "/official?keep=1" },
  { fixtureId: "fixture-null", appearanceStatus: "absent", minutes: null, rating: null, fixtureStartsAt: null, name: "Official Other", href: "/other#history" },
];

test("real profile initializer reuses existing catalogues and only widens the five intended copy properties", () => {
  for (const locale of locales) {
    const { context, text, api } = profileContext(locale, true, true);
    assert.equal(text.matchHistory, "SENTINEL_HISTORY"); assert.equal(text.minutes, "SENTINEL_MINUTES"); assert.equal(text.rating, "SENTINEL_RATING");
    assert.equal(text.unavailable, api.touchlinePlayerAppearanceLabel(null, locale, true));
    assert.equal(text.totalRating, (context.exactCopy as Record<string, string>).totalRating);
    const original = (context.getTouchlinePlayerProfileCopy as (requested: string, draft: boolean) => Record<string, string>)(locale, true);
    for (const key of Object.keys(original)) if (!["totalRating", "matchHistory", "minutes", "rating", "unavailable"].includes(key)) assert.equal(text[key], original[key]);
  }
});

test("actual fixture panel and zoom history preserve zero/null, order, IDs, names, links and explicit history metadata", () => {
  const before = JSON.stringify(fixtures);
  for (const locale of locales) for (const review of [false, true]) {
    const { context, api, text } = profileContext(locale, review);
    const model = { matchHistory: fixtures, currentOrSelectedFixture: fixtures[0] };
    const Panel = evaluate(fixtureFunction.getText(page), context) as React.ComponentType<Record<string, unknown>>;
    const tree = Panel as (props: Record<string, unknown>) => React.ReactElement;
    const props = { model, text, locale, draftLocalesEnabled: review, matchStats: null, position: "GK" };
    const html = renderToStaticMarkup(React.createElement(Panel, props));
    assert.ok(html.includes(text.matchHistory)); assert.ok(html.includes(`${text.rating}: 0`)); assert.ok(html.includes(`${text.rating}: —`));
    assert.ok(html.indexOf(api.touchlinePlayerAppearanceLabel("started", locale, review)) < html.indexOf(api.touchlinePlayerAppearanceLabel("absent", locale, review)));
    const keys: string[] = [];
    const walk = (element: unknown) => { if (!React.isValidElement(element)) return; if (element.key !== null) keys.push(element.key); React.Children.forEach((element.props as { children?: React.ReactNode }).children, walk); };
    walk(tree(props)); assert.deepEqual(keys, ["fixture-zero", "fixture-null"]);
    const fields = evaluate(initializer("zoomMatchHistoryFields", routeBody), { ...context, playerStatistics: model }) as Array<Record<string, string>>;
    assert.equal(fields.length, 2);
    const date = formatTouchlineProfileTimestamp(fixtures[0].fixtureStartsAt, locale, review);
    assert.equal(fields[0].historyDisplayLabel, date);
    assert.equal(fields[0].label, `${(context.zoomCopy as Record<string, string>).matchHistoryEntry} · ${date}`);
    assert.equal(fields[0].value, `${api.touchlinePlayerAppearanceLabel("started", locale, review)} · 0 ${text.minutes.toLowerCase()} · ${text.rating} 0`);
    assert.equal(fields[1].value, `${api.touchlinePlayerAppearanceLabel("absent", locale, review)} · ${text.unavailable} · ${text.rating} —`);
    assert.equal(fields[1].historyDisplayLabel, text.unavailable);
    assert.ok(fields.every(field => field.kind === "history"));
    const empty = renderToStaticMarkup(React.createElement(Panel, { ...props, model: { matchHistory: [], currentOrSelectedFixture: null } }));
    assert.ok(empty.includes(text.unavailable));
  }
  assert.equal(JSON.stringify(fixtures), before);
});

test("real exported wrapper uses server policy OFF/ON without accepting forged query activation", async () => {
  const text = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrapper = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
    && Boolean(node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)));
  assert.ok(wrapper?.body);
  const call = wrapper.body.statements.find(ts.isReturnStatement)?.expression;
  assert.ok(call && ts.isCallExpression(call));
  assert.equal(call.arguments[1]?.getText(tree), 'isTouchLineSiteLocalesEnabled("/touchline-players/[player]")');
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(wrapper.getText(tree), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: exported, ...releasePolicy, [call.expression.getText(tree)]: (props: unknown, enabled: boolean) => ({ props, enabled }),
  });
  const invoke = exported.default as (props: unknown) => Promise<{ props: unknown; enabled: boolean }>;
  try {
    for (const flag of [undefined, "false", "TRUE", "true"]) {
      if (flag === undefined) delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED;
      else releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED = flag;
      for (const lang of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"]) {
        const props = { searchParams: Promise.resolve({ lang, siteLocalesEnabled: true, draftLocalesEnabled: true, TOUCHLINE_SITE_LOCALES_ENABLED: "true" }) };
        const result = await invoke(props);
        assert.equal(result.props, props, "original route props are forwarded unchanged");
        assert.equal(result.enabled, flag === "true", lang);
      }
    }
  } finally { delete releaseEnv.TOUCHLINE_SITE_LOCALES_ENABLED; }
});
