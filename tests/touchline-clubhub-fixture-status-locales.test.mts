import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { resolveTouchlineCatalogueLocale } from "../lib/touchlineArena/catalogue-locale.ts";
import { getTouchlineClubHubProfileCopy } from "../lib/touchlineArena/club-hub-profile-i18n.ts";
import { touchlineFixtureStatusLabel } from "../lib/touchlineArena/match-centre.ts";

const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "localizedFixtureStatus");
assert.ok(declaration);
const exports: { localize?: (value: string, locale: string, draft?: boolean) => string } = {};
runInNewContext(ts.transpileModule(`${declaration.getText(ast)}\nexport const localize = localizedFixtureStatus;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, resolveTouchlineCatalogueLocale, getTouchlineClubHubProfileCopy, touchlineFixtureStatusLabel });
const localize = exports.localize!;

const examples = [
  ["en-GB", "1st Half", "2nd Half", "Half Time"],
  ["pt-BR", "1º tempo", "2º tempo", "Intervalo"],
  ["es-ES", "Primera parte", "Segunda parte", "Descanso"],
  ["it-IT", "Primo tempo", "Secondo tempo", "Intervallo"],
  ["fr-FR", "1re mi-temps", "2e mi-temps", "Mi-temps"],
  ["ar-SA", "الشوط الأول", "الشوط الثاني", "استراحة بين الشوطين"],
  ["tr-TR", "1. yarı", "2. yarı", "Devre arası"],
  ["de-DE", "1. Halbzeit", "2. Halbzeit", "Halbzeitpause"],
] as const;

test("actual ClubHub helper localizes provider half states with real shared catalogues", () => {
  for (const [locale, first, second, half] of examples) {
    assert.equal(localize("1st Half", locale, true), first);
    assert.equal(localize("2nd Half", locale, true), second);
    assert.equal(localize("Half Time", locale, true), half);
    if (locale !== "en-GB") {
      assert.equal(localize("first_half", locale, true), first);
      assert.equal(localize("second-half", locale, true), second);
      assert.equal(localize("halftime", locale, true), half);
    }
  }
});

test("default gates, previous statuses and unknown factual values remain intact", () => {
  for (const [locale] of examples) {
    assert.equal(localize("Half Time", locale), locale === "pt-BR" ? "Intervalo" : "Half Time");
    assert.equal(localize("Half Time", locale, false), locale === "pt-BR" ? "Intervalo" : "Half Time");
    for (const value of ["  Official $& Club  ", "TouchLine England", "Unknown_State", "", "   "]) {
      assert.equal(localize(value, locale, true), value);
    }
    if (locale === "en-GB") continue;
    const copy = getTouchlineClubHubProfileCopy(locale, true);
    for (const [values, expected] of [
      [["not started", "scheduled", "upcoming", "ns"], copy.scheduled],
      [["live", "inplay", "in play"], copy.live],
      [["finished", "ft", "full time"], copy.finished],
      [["postponed"], copy.postponed],
      [["cancelled", "canceled"], copy.cancelled],
    ] as const) for (const value of values) assert.equal(localize(value, locale, true), expected);
  }
  assert.equal(localize("  Half Time  ", "en-GB", true), "  Half Time  ");
  assert.equal(localize("Half Time", "unknown", true), "Half Time");
});

test("localized status remains wired into the rendered matchup without exporting a new route API", () => {
  assert.match(source, /status: localizedFixtureStatus\(matchPreview\.status, locale, draftLocalesEnabled\)/);
  assert.ok(!declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  assert.match(lineup, /\[matchup\.status, matchup\.startsAt\]\.filter\(Boolean\)\.join\(" · "\)/);
});
