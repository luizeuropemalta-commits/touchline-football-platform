import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { formatTouchlineProfileTimestamp } from "../lib/touchlineArena/profile-timestamp.ts";

test("fixture timestamps are readable in both languages with an explicit stable zone", () => {
  const en = formatTouchlineProfileTimestamp("2026-09-20T13:00:00+00:00", "en-GB");
  const pt = formatTouchlineProfileTimestamp("2026-09-20T13:00:00+00:00", "pt-BR");
  assert.match(en!, /20 Sept 2026.*13:00 UTC/);
  assert.match(pt!, /20 de set\. de 2026.*13:00 UTC/);
  assert.equal(en, formatTouchlineProfileTimestamp("2026-09-20T15:00:00+02:00", "en-GB"));
  assert.equal(en, formatTouchlineProfileTimestamp("2026-09-20T13:00:00.000000Z", "en-GB"));
});
test("midnight offsets cross the date correctly without guessing missing dates or zones", () => {
  assert.match(formatTouchlineProfileTimestamp("2026-10-01T00:30:00+02:00", "en-GB")!, /30 Sept 2026.*22:30 UTC/);
  for (const missing of [null, undefined, "", "bad", "2026-09-20", "2026-09-20T13:00:00", "2026-09-20T99:99:00Z"]) {
    assert.equal(formatTouchlineProfileTimestamp(missing, "pt-BR"), null);
  }
});
test("profile history, selected match, zoom history and season metadata never print raw timestamps", () => {
  const page = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("profile.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "formatOfficialSyncTime") calls.push(node);
    node.forEachChild(visit);
  }
  visit(ast);
  for (const value of ["fixture.fixtureStartsAt", "current.fixtureStartsAt", "statistics.latestSyncAt", "official.fetchedAt", "playerStatistics.previousCompletedSeason.latestSyncAt"]) {
    assert.ok(calls.some(call => call.arguments[0]?.getText(ast) === value), value);
  }
  assert.equal(calls.filter(call => call.arguments[0]?.getText(ast) === "fixture.fixtureStartsAt").length, 2, "panel and zoom history both format the fixture instant");
  for (const call of calls) assert.deepEqual(call.arguments.map(arg => arg.getText(ast)).slice(1), ["locale", "draftLocalesEnabled"]);
  assert.doesNotMatch(page, /\{(?:fixture|current)\.fixtureStartsAt \?\? text\.unavailable\}/);
  assert.doesNotMatch(page, />\{statistics\.latestSyncAt\}<\/time>/);
});

test("explicit eight-language timestamps retain Gregorian calendar and UTC without opening default gates", () => {
  const instant = "2026-09-20T13:00:00Z";
  const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"];
  for (const locale of locales) {
    const expected = new Intl.DateTimeFormat(locale, {
      calendar: "gregory", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23", timeZone: "UTC", timeZoneName: "short",
    }).format(new Date(instant));
    assert.equal(formatTouchlineProfileTimestamp(instant, locale, true), expected);
    if (locale !== "en-GB" && locale !== "pt-BR") assert.equal(formatTouchlineProfileTimestamp(instant, locale), formatTouchlineProfileTimestamp(instant, "en-GB"));
    assert.equal(formatTouchlineProfileTimestamp(null, locale, true), null);
  }
});
