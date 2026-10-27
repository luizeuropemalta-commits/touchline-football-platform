import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { extractIsolatedPageCss } from "./helpers/touchline-lineup-anchor-page-css.mts";

const root = path.resolve(import.meta.dirname, "..");

const parsePageCssTest = (source: string) => extractIsolatedPageCss(
  ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
);

test("isolated page CSS preserves static rules and substitutes only known unmounted rail classes", () => {
  const css = "#touchline-club-lineup { scroll-margin-top: 91px; }\n"
    + ".club-hub-right-rail .${officialLeagueStyles.layout} { width: 100%; }\n"
    + ".club-hub-right-rail .${premiumStyles.nextFixtureClub} img { width: 44px; }";
  assert.equal(parsePageCssTest("<style>{`" + css + "`}</style>"), css
    .replace("${officialLeagueStyles.layout}", "isolated-unmounted-rail-official-layout")
    .replace("${premiumStyles.nextFixtureClub}", "isolated-unmounted-rail-premium-club"));
  assert.equal(parsePageCssTest("<style>{`body { margin: 0; }`}</style>"), "body { margin: 0; }");
});

test("isolated page CSS rejects executable, unknown and non-rail interpolations", () => {
  for (const expression of ["run()", "officialLeagueStyles['layout']", "otherStyles.layout",
    "officialLeagueStyles.unknown", "officialLeagueStyles?.layout", "officialLeagueStyles.constructor"]) {
    assert.throws(() => parsePageCssTest("<style>{`.club-hub-right-rail .${" + expression + "} { width: 100%; }`}</style>"));
  }
  assert.throws(() => parsePageCssTest("<style>{`#touchline-club-lineup { scroll-margin-top: ${officialLeagueStyles.layout}; }`}</style>"));
  assert.throws(() => parsePageCssTest("<style>{getCss()}</style>"));
});

test("isolated page CSS extracts current production anchor and fallback rules unchanged", () => {
  const source = readFileSync(path.join(root, "app/touchline-clubs/[club]/page.tsx"), "utf8");
  const css = parsePageCssTest(source);
  for (const selector of ["#touchline-club-lineup", ".club-hub-deferred-lineup"]) {
    const start = source.indexOf(`${selector} {`);
    assert.ok(start >= 0, `production selector required: ${selector}`);
    const rule = source.slice(start, source.indexOf("}", start) + 1);
    assert.ok(css.includes(rule), `production rule preserved: ${selector}`);
  }
  assert.ok(css.includes(".club-hub-right-rail .isolated-unmounted-rail-official-layout"));
});
