import assert from "node:assert/strict";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { touchlineFixtureRailDateLabel } from "../lib/touchlineArena/match-centre.ts";
import * as rounds from "../lib/touchlineArena/arena-fixture-round.ts";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import * as copy from "../lib/touchlineArena/match-centre-i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const fixture = { startsAt: "2026-08-29T12:00:00Z" };
const before = Date.parse("2026-08-28T12:00:00Z");
const sameDay = Date.parse("2026-08-29T11:00:00Z");
const source = readFileSync(new URL("../lib/touchlineArena/match-centre.ts", import.meta.url), "utf8");
type FormatCall = { locale: string; options: Intl.DateTimeFormatOptions };

function isolated(future: boolean) {
  const calls: FormatCall[] = [], seen: string[] = [];
  function DateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions) {
    calls.push({ locale, options }); return new Intl.DateTimeFormat(locale, options);
  }
  const isolatedIntl = { ...Intl, DateTimeFormat, PluralRules: Intl.PluralRules };
  const catalogueModule: Record<string, unknown> = {};
  const catalogueSource = readFileSync(new URL("../lib/touchlineArena/match-centre-i18n.ts", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(catalogueSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: catalogueModule, Intl: isolatedIntl, require: (name: string) => { assert.equal(name, "./catalogue-locale.ts"); return { resolveTouchlineCatalogueLocale }; },
  });
  const fixtureModule: { touchlineFixtureRailDateLabel?: typeof touchlineFixtureRailDateLabel } = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: fixtureModule, Intl: isolatedIntl,
    require: (name: string) => {
      if (name === "./catalogue-locale.ts") return { resolveTouchlineCatalogueLocale };
      if (name === "./arena-fixture-round.ts") return rounds;
      if (name === "./match-centre-i18n.ts") return { getTouchlineMatchCentreCopy: (locale: string, enabled = false) => { seen.push(locale); return (catalogueModule.getTouchlineMatchCentreCopy as typeof copy.getTouchlineMatchCentreCopy)(locale, enabled); } };
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const label: typeof touchlineFixtureRailDateLabel = (fixture, locale, zone, now) => fixtureModule.touchlineFixtureRailDateLabel!(fixture, locale, zone, now, future);
  return { label, calls, seen };
}

test("public rail date preserves EN/PT exact text while gating six drafts and invalid locales", () => {
  assert.equal(touchlineFixtureRailDateLabel(fixture, "en-GB", "UTC", sameDay), "TODAY");
  assert.equal(touchlineFixtureRailDateLabel(fixture, "pt-BR", "UTC", sameDay), "HOJE");
  assert.equal(touchlineFixtureRailDateLabel(fixture, "en-GB", "UTC", before), "SAT 29 AUG");
  assert.equal(touchlineFixtureRailDateLabel(fixture, "pt-BR", "UTC", before), "SÁB 29 AGO");
  for (const locale of [...locales.slice(2), "constructor", "bad_locale", "", null, undefined]) {
    assert.equal(touchlineFixtureRailDateLabel(fixture, locale as i18n.TouchLineLocale, "UTC", before), "SAT 29 AUG", String(locale));
    assert.equal(touchlineFixtureRailDateLabel(fixture, locale as i18n.TouchLineLocale, "UTC", sameDay), "TODAY");
  }
});

test("shared today getter receives full draft locale and Gregorian date parts remain explicit", () => {
  const probe = isolated(true);
  for (const locale of locales) {
    probe.calls.length = 0; probe.seen.length = 0;
    assert.equal(probe.label(fixture, locale, "UTC", sameDay), copy.TOUCHLINE_MATCH_CENTRE_CATALOGUES[locale].today);
    assert.deepEqual(probe.seen, [locale]);
    assert.ok(probe.calls.filter(call => call.options.year).every(call => call.options.calendar === "gregory"));
    probe.calls.length = 0;
    const label = probe.label(fixture, locale, "UTC", before);
    const formatted = probe.calls.find(call => call.options.weekday);
    assert.equal(formatted?.locale, locale);
    assert.equal(formatted?.options.calendar, "gregory");
    assert.equal(formatted?.options.timeZone, "UTC");
    assert.ok(label.length > 0); assert.doesNotMatch(label, /[.,]/);
    if (locale === "ar-SA") assert.match(label, /أغسطس/, "Arabic must describe August, not the default Islamic calendar month");
    if (locale === "tr-TR") assert.equal(label, "CMT 29 AĞU");
  }
});

test("day comparison uses the requested zone, validated UTC fallback, offsets and DST without changing instants", () => {
  const midnight = { startsAt: "2026-08-29T23:30:00Z" }, now = Date.parse("2026-08-30T00:30:00Z");
  assert.equal(touchlineFixtureRailDateLabel(midnight, "en-GB", "UTC", now), "SAT 29 AUG");
  assert.equal(touchlineFixtureRailDateLabel(midnight, "en-GB", "Europe/Malta", now), "TODAY");
  assert.equal(touchlineFixtureRailDateLabel(midnight, "en-GB", "America/New_York", now), "TODAY");
  for (const zone of ["Mars/Nowhere", "", " ", "x".repeat(101)]) assert.equal(touchlineFixtureRailDateLabel(midnight, "en-GB", zone, now), "SAT 29 AUG");
  assert.equal(touchlineFixtureRailDateLabel(midnight, "pt-BR", " Europe/Malta ", now), "HOJE");
  for (const [start, end] of [["2026-03-29T00:30:00Z", "2026-03-29T02:30:00Z"], ["2026-10-25T00:30:00Z", "2026-10-25T02:30:00Z"]]) {
    assert.equal(touchlineFixtureRailDateLabel({ startsAt: start }, "en-GB", "Europe/London", Date.parse(end)), "TODAY");
  }
  assert.equal(touchlineFixtureRailDateLabel({ startsAt: "2026-08-29T14:00:00+02:00" }, "pt-BR", "UTC", before), "SÁB 29 AGO");
  assert.deepEqual(midnight, { startsAt: "2026-08-29T23:30:00Z" });
});

test("missing or invalid timestamps keep the unavailable dash without formatting", () => {
  const probe = isolated(false);
  for (const startsAt of [undefined, null, "", "not-a-date"]) assert.equal(probe.label({ startsAt } as typeof fixture, "en-GB", "UTC", before), "—");
  for (const now of [Number.NaN, Infinity, -Infinity]) assert.equal(probe.label(fixture, "en-GB", "UTC", now), "—");
  assert.equal(probe.calls.length, 0); assert.equal(probe.seen.length, 0);
});

test("actual Live rail JSX binds the shared helper with fixture, locale, zone and clock intact", () => {
  const component = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
  const sf = ts.createSourceFile("TouchlineMatchCentre.tsx", component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.JsxElement[] = [];
  function walk(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(sf) === "className" && prop.initializer?.getText(sf) === "{styles.fixtureDay}")) matches.push(node);
    ts.forEachChild(node, walk);
  }
  walk(sf); assert.equal(matches.length, 1);
  for (const future of [false, true]) for (const language of locales) {
    const probe = isolated(future);
    const expression = matches[0].getText(sf);
    const fixtureModule: { element?: React.ReactElement } = {};
    vm.runInNewContext(ts.transpileModule(`export const element = (${expression});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
      exports: fixtureModule, React, styles: { fixtureDay: "fixtureDay" }, fixture,
      language, initialTimeZone: "Europe/Malta", now: sameDay, draftLocalesEnabled: future,
      touchlineFixtureRailDateLabel: probe.label,
    });
    const html = renderToStaticMarkup(fixtureModule.element!);
    const expected = copy.TOUCHLINE_MATCH_CENTRE_CATALOGUES[future || language === "pt-BR" ? language : "en-GB"].today;
    assert.equal(html, renderToStaticMarkup(React.createElement("span", { className: "fixtureDay" }, expected)));
    assert.ok(probe.calls.filter(call => call.options.year).every(call => call.options.timeZone === "Europe/Malta"));
  }
});
