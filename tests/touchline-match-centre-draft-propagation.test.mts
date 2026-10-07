import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineMatchCentreCopy } from "../lib/touchlineArena/match-centre-i18n.ts";
import { localizedPositionLabel } from "../lib/touchlineArena/position-labels.ts";
import { touchlineFixtureRailDateLabel, touchlineFixtureStatusLabel, touchlineMatchCentreDisplayState } from "../lib/touchlineArena/match-centre.ts";
import type { TouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const source = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("centre.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["matchCentreSeasonLabel", "fixtureLabel", "fixtureDate", "fixtureRailStatus", "status", "Countdown", "verificationLabel", "lineupPlayerRows", "teamName", "MatchTeamSheet"];
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""));
assert.equal(helpers.length, names.length);
const exports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(`${helpers.map(node => node.getText(ast)).join("\n")}\nexport { ${names.join(", ")} };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  exports, resolveTouchlineCatalogueLocale, getTouchlineMatchCentreCopy, localizedPositionLabel,
  touchlineFixtureStatusLabel, touchlineMatchCentreDisplayState,
  useState: (initial: unknown) => [initial, () => assert.fail("render must not update state")],
  useEffect: () => undefined,
  TeamMark: () => null,
  styles: new Proxy({}, { get: (_, key) => String(key) }),
  require(name: string) { assert.equal(name, "react/jsx-runtime"); return jsxRuntime; },
});
const season = exports.matchCentreSeasonLabel as (name: string | null, locale: string, draft?: boolean) => string | null;
const date = exports.fixtureDate as (fixture: { startsAt?: string }, locale: string, zone: string, options: Intl.DateTimeFormatOptions, draft?: boolean) => string;
const verified = exports.verificationLabel as (metadata: { fetchedAt?: string }, locale: string, zone: string, draft?: boolean) => string | null;
const sheet = exports.MatchTeamSheet as (props: Record<string, unknown>) => React.ReactNode;
const countdown = exports.Countdown as (props: Record<string, unknown>) => React.ReactNode;
const instant = "2026-10-03T15:30:00Z";

test("all internal locale consumers and JSX child boundaries forward the same explicit draft flag", () => {
  const counts = new Map<string, number>();
  const callees = ["getTouchlineMatchCentreCopy", "matchCentreSeasonLabel", "fixtureLabel", "fixtureDate", "fixtureRailStatus", "status", "verificationLabel", "touchlineFixtureRailDateLabel", "touchlineFixtureStatusLabel"];
  const jsxNames = ["Countdown", "MatchTeamSheet", "TouchlineGlobalNavigation", "TouchlineFixtureAlerts"];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && callees.includes(node.expression.getText(ast))) {
      const name = node.expression.getText(ast);
      counts.set(name, (counts.get(name) ?? 0) + 1);
      assert.equal(node.arguments.at(-1)?.getText(ast), "draftLocalesEnabled", name);
    }
    if (ts.isJsxSelfClosingElement(node) && jsxNames.includes(node.tagName.getText(ast))) {
      const name = node.tagName.getText(ast);
      counts.set(name, (counts.get(name) ?? 0) + 1);
      const prop = node.attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(ast) === "draftLocalesEnabled");
      assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer), name);
      assert.equal(prop.initializer.expression?.getText(ast), "draftLocalesEnabled", name);
    }
    node.forEachChild(visit);
  }
  visit(ast);
  for (const name of [...callees, ...jsxNames]) assert.ok(counts.get(name), `${name} must have a real call site`);
});

test("draft date/status/season helpers preserve EN/PT defaults and use explicit eight-locale catalogues", () => {
  const options = { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" } as const;
  for (const locale of ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as TouchLineLocale[]) {
    const text = getTouchlineMatchCentreCopy(locale, true);
    assert.equal(season("2026/27", locale, true), `${text.season} 2026/2027`);
    assert.equal(date({ startsAt: instant }, locale, "UTC", options, true), new Intl.DateTimeFormat(locale, { ...options, calendar: "gregory", timeZone: "UTC" }).format(new Date(instant)));
    assert.equal(touchlineFixtureRailDateLabel({ startsAt: instant }, locale, "UTC", Date.parse(instant), true), text.today);
    assert.equal(touchlineFixtureStatusLabel("unknown official value", locale, true), "unknown official value");
    assert.equal(date({ startsAt: "bad" }, locale, "UTC", options, true), "—");
    if (locale !== "pt-BR") {
      assert.equal(season("2026/27", locale), "Season 2026/2027");
      assert.equal(date({ startsAt: instant }, locale, "UTC", options), date({ startsAt: instant }, "en-GB", "UTC", options));
    }
  }
  assert.equal(touchlineFixtureStatusLabel("1st half", "ar-SA", true), "الشوط الأول");
  assert.equal(touchlineFixtureStatusLabel("1st half", "ar-SA"), touchlineFixtureStatusLabel("1st half", "en-GB"));
  assert.ok(verified({ fetchedAt: instant }, "ar-SA", "UTC", true)?.startsWith(`${getTouchlineMatchCentreCopy("ar-SA", true).lastVerifiedAt} · `));
  assert.equal(verified({ fetchedAt: "bad" }, "ar-SA", "UTC", true), null);
});

test("actual lineup and countdown JSX localize text without mutating factual names, numbers or positions", () => {
  const detail = {
    fixture: { id: "fixture", homeTeam: { id: "home", name: "Official Club" } }, capturedAt: instant,
    lineups: [{ id: "member", teamId: "home", playerId: "player", playerName: "Player $&", position: "Goalkeeper", jerseyNumber: 1, isStarter: true }],
    playerStatistics: [{ playerId: "player", minutes: 0, rating: 7.2 }],
  };
  const before = JSON.stringify(detail);
  for (const draftLocalesEnabled of [false, true]) {
    const text = getTouchlineMatchCentreCopy("ar-SA", draftLocalesEnabled);
    const html = renderToStaticMarkup(React.createElement(sheet, { detail, teamId: "home", language: "ar-SA", draftLocalesEnabled }));
    assert.ok(html.includes(`${text.starters} · 1`));
    assert.ok(html.includes(text.rating));
    assert.ok(html.includes(draftLocalesEnabled ? localizedPositionLabel("Goalkeeper", "ar-SA", true)! : "Goalkeeper"));
    assert.ok(html.includes("Player $&amp;"));
    assert.ok(html.includes("<b>0</b>"));
    assert.ok(html.includes("<b>7.2</b>"));
    const timer = renderToStaticMarkup(React.createElement(countdown, { language: "ar-SA", draftLocalesEnabled, startsAt: instant, initialNow: Date.parse(instant) - 3_600_000 }));
    assert.ok(timer.includes(text.countdown));
    assert.ok(timer.includes(`01${text.hourUnit}`));
    assert.equal(JSON.stringify(detail), before);
  }
});
