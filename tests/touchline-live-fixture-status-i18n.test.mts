import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as matchCentre from "../lib/touchlineArena/match-centre.ts";
import * as round from "../lib/touchlineArena/arena-fixture-round.ts";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as catalogueLocale from "../lib/touchlineArena/catalogue-locale.ts";
import * as matchCopy from "../lib/touchlineArena/match-centre-i18n.ts";
import type { TouchlinePublicFixture } from "../lib/football-data/public-fixture.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const aliases = {
  firstHalf: ["1st half", "first half"], secondHalf: ["2nd half", "second half"], halfTime: ["half time", "halftime"],
  fullTime: ["full time", "finished", "ft"], live: ["live", "in play", "inplay"], next: ["next"], notStarted: ["not started"],
};
const baseline = {
  "en-GB": { firstHalf: "1st Half", secondHalf: "2nd Half", halfTime: "Half-time", fullTime: "Full Time", live: "LIVE", next: "Next", notStarted: "Not started" },
  "pt-BR": { firstHalf: "1º tempo", secondHalf: "2º tempo", halfTime: "Intervalo", fullTime: "Encerrado", live: "AO VIVO", next: "Próximo", notStarted: "Não iniciado" },
};
const copyKeys = Object.keys(baseline["en-GB"]) as (keyof typeof aliases)[];
const source = readFileSync(new URL("../lib/touchlineArena/match-centre.ts", import.meta.url), "utf8");

// Real catalogue resolver with explicit opt-in; inherited-key probing remains
// confined to the VM. Public defaults and completeness flags stay untouched.
function futureHelper(_unused?: undefined, inheritedProbe = false) {
  void _unused;
  const exports: Partial<typeof matchCentre> = {};
  runInNewContext((inheritedProbe ? 'Object.prototype["provider inherited"] = "FALSE_STATUS_LABEL";\n' : "")
    + ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => {
      if (name === "./arena-fixture-round.ts") return round;
      if (name === "./catalogue-locale.ts") return catalogueLocale;
      if (name === "./match-centre-i18n.ts") return matchCopy;
      assert.fail(`Unexpected helper dependency: ${name}`);
    } });
  return (value: Parameters<typeof matchCentre.touchlineFixtureStatusLabel>[0], locale: i18n.TouchLineLocale) => exports.touchlineFixtureStatusLabel!(value, locale, true);
}

test("fourteen aliases map to seven complete meanings in eight explicitly gated status catalogues", () => {
  assert.deepEqual(Object.keys(matchCentre.TOUCHLINE_FIXTURE_STATUS_CATALOGUES), locales);
  assert.deepEqual(matchCentre.TOUCHLINE_FIXTURE_STATUS_DRAFT_LOCALES, locales.slice(2));
  assert.equal(matchCentre.TOUCHLINE_FIXTURE_STATUS_DRAFT_STATUS, "draft");
  for (const locale of locales) {
    const copy = matchCentre.TOUCHLINE_FIXTURE_STATUS_CATALOGUES[locale];
    assert.deepEqual(Object.keys(copy), copyKeys);
    for (const value of Object.values(copy)) { assert.equal(typeof value, "string"); assert.ok(value.trim()); assert.doesNotMatch(value, /TODO|FIXME|\{[^}]+\}/); }
  }
  for (const locale of ["en-GB", "pt-BR"] as const) assert.deepEqual(matchCentre.TOUCHLINE_FIXTURE_STATUS_CATALOGUES[locale], baseline[locale]);
  assert.match(matchCentre.TOUCHLINE_FIXTURE_STATUS_CATALOGUES["ar-SA"].fullTime, /[\u0600-\u06ff]/);
});

test("real helper preserves all EN/PT aliases, case and original separator normalization", () => {
  assert.equal(Object.values(aliases).flat().length, 14);
  for (const locale of ["en-GB", "pt-BR"] as const) for (const meaning of copyKeys) for (const alias of aliases[meaning]) {
    for (const value of [alias, `  ${alias.toUpperCase()}  `, alias.replaceAll(" ", "__"), alias.replaceAll(" ", "--"), alias.replaceAll(" ", " \t ")]) {
      assert.equal(matchCentre.touchlineFixtureStatusLabel(value, locale), baseline[locale][meaning], `${locale}:${value}`);
    }
  }
});

test("unknown provider facts stay raw-trimmed; empty and prototype-looking values cannot become labels", () => {
  const inherited = futureHelper(undefined, true);
  for (const locale of locales) {
    for (const value of [null, undefined, "", " \n\t "]) assert.equal(matchCentre.touchlineFixtureStatusLabel(value, locale), "");
    for (const value of ["  Provider-Specific_STATUS  ", "AET", "FT_PEN", "Cancelled", "constructor", "toString", "__proto__", "  HALF__UNKNOWN  "]) {
      assert.equal(matchCentre.touchlineFixtureStatusLabel(value, locale), value.trim());
    }
    assert.equal(inherited("  provider inherited  ", locale), "provider inherited");
  }
});

test("real public helper cannot release six drafts; isolated future seam resolves all aliases in every catalogue", () => {
  const future = futureHelper();
  for (const locale of locales) for (const meaning of copyKeys) for (const alias of aliases[meaning]) {
    const publicExpected = baseline[locale === "pt-BR" ? "pt-BR" : "en-GB"][meaning];
    assert.equal(matchCentre.touchlineFixtureStatusLabel(alias, locale), publicExpected);
    assert.equal(future(alias, locale), matchCentre.TOUCHLINE_FIXTURE_STATUS_CATALOGUES[locale][meaning]);
  }
  for (const locale of locales.slice(2)) assert.equal(i18n.isTouchLineLocaleComplete(locale), false);
});

function parentToChild(normalize: typeof i18n.normalizeTouchLineLocale, label: typeof matchCentre.touchlineFixtureStatusLabel, draftLocalesEnabled = false) {
  const childSource = readFileSync(new URL("../components/touchline/ClubHubLiveFixtureScore.tsx", import.meta.url), "utf8");
  const effects: unknown[] = [], calls: { fixtureId: unknown; initialFixture: unknown; locale: unknown }[] = [];
  const hooks = { ...React, useState: (initial: unknown) => [initial, () => assert.fail("Unexpected state write")],
    useEffect: (effect: unknown) => { effects.push(effect); } };
  const exports: { default?: React.ComponentType<Record<string, unknown>> } = {};
  runInNewContext(ts.transpileModule(childSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText,
    { exports, React, require: (name: string) => {
      if (name === "react") return hooks;
      if (name === "next/navigation") return { useRouter: () => ({ refresh: () => assert.fail("Unexpected refresh") }) };
      if (name === "@/lib/football-data/public-fixture-client") return { parseTouchlinePublicFixtures: () => assert.fail("Unexpected polling") };
      if (name === "@/lib/touchlineArena/match-centre") return { ...matchCentre, touchlineFixtureStatusLabel: label };
      assert.fail(`Unexpected child import: ${name}`);
    } });
  const parentSource = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("Parent.tsx", parentSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let binding: ts.JsxSelfClosingElement | undefined;
  function visit(node: ts.Node) { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "ClubHubLiveFixtureScore") binding = node; ts.forEachChild(node, visit); }
  visit(ast); assert.ok(binding);
  const js = ts.transpileModule(`(${binding.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return { parentSource, effects, calls, render(locale: string, fixture: TouchlinePublicFixture | null) {
    const html = runInNewContext(js, { React, locale, draftLocalesEnabled, matchup: { fixtureId: "canonical-fixture-id", initialFixture: fixture },
      resolveTouchlineCatalogueLocale: (value: string, flag: boolean) => { normalize(value); return catalogueLocale.resolveTouchlineCatalogueLocale(value, flag); },
      ClubHubLiveFixtureScore: (props: Record<string, unknown>) => {
        calls.push(props as typeof calls[number]); return React.createElement(exports.default!, props);
      } });
    return renderToStaticMarkup(html);
  } };
}
const fixture = (patch: Record<string, unknown> = {}) => ({
  id: "canonical-fixture-id", providerId: "fixture-provider-id", startsAt: "2020-01-01T12:00:00Z", status: "Live",
  homeTeam: { id: "h", providerId: "h", name: "Official Home" }, awayTeam: { id: "a", providerId: "a", name: "Official Away" },
  homeScore: 0, awayScore: 0, ...patch,
}) as TouchlinePublicFixture;

test("real parent binding passes normalized full locale into the real child presentation through all three status calls", () => {
  const normalizations: string[] = [], labelCalls: string[] = [];
  const future = futureHelper();
  const view = parentToChild(((value: string) => { normalizations.push(value); return value; }) as typeof i18n.normalizeTouchLineLocale,
    (value, locale) => { labelCalls.push(locale); return future(value, locale); }, true);
  for (const locale of locales) {
    const copy = matchCentre.TOUCHLINE_FIXTURE_STATUS_CATALOGUES[locale];
    for (const [data, expected] of [
      [fixture({ status: "FT", liveMinute: 77, livePeriod: "1st Half" }), `0 — 0 · ${copy.fullTime}`],
      [fixture({ liveMinute: 0, livePeriod: "1st Half" }), `0 — 0 · 0′ · ${copy.firstHalf}`],
      [fixture(), `0 — 0 · ${copy.live}`],
    ] as const) {
      const before = JSON.stringify(data); assert.equal(view.render(locale, data), `<b aria-live="polite">${expected}</b>`); assert.equal(JSON.stringify(data), before);
      assert.equal(view.calls.at(-1)?.initialFixture, data); assert.equal(view.calls.at(-1)?.fixtureId, "canonical-fixture-id"); assert.equal(view.calls.at(-1)?.locale, locale);
    }
  }
  assert.deepEqual(normalizations, locales.flatMap(locale => [locale, locale, locale])); assert.deepEqual(labelCalls, normalizations);
  assert.match(view.parentSource, /import \{ resolveTouchlineCatalogueLocale \} from "@\/lib\/touchlineArena\/catalogue-locale"/);
});

test("actual gated parent/child keeps zero/null/partial scores, minute zero, pregame VS and raw unknown text", () => {
  const view = parentToChild(i18n.normalizeTouchLineLocale, matchCentre.touchlineFixtureStatusLabel);
  for (const locale of locales) {
    const copy = baseline[locale === "pt-BR" ? "pt-BR" : "en-GB"];
    for (const [data, expected] of [
      [null, "VS"], [fixture({ status: "Not Started", homeScore: null, awayScore: null }), "VS"],
      [fixture({ homeScore: 0, awayScore: null }), `VS · ${copy.live}`],
      [fixture({ homeScore: null, awayScore: 0 }), `VS · ${copy.live}`],
      [fixture({ liveMinute: 0 }), "0 — 0 · 0′"],
      [fixture({ status: "FT", liveMinute: 88, livePeriod: "2nd Half", homeScore: 2, awayScore: 1 }), `2 — 1 · ${copy.fullTime}`],
      [fixture({ status: "  Provider <special>  " }), "0 — 0 · Provider &lt;special&gt;"],
    ] as const) assert.equal(view.render(locale, data), `<b aria-live="polite">${expected}</b>`);
    assert.equal(view.calls.at(-1)?.locale, locale === "pt-BR" ? "pt-BR" : "en-GB");
  }
});
