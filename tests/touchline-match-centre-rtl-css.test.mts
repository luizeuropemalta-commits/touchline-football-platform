import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url),
  "utf8",
);

test("match-centre keeps physical LTR composition with logical inline presentation in every locale", () => {
  for (const pattern of [
    /\.fixtureScroller \{[^}]*padding-inline: 12px 10px;/,
    /\.fixtureGroup:not\(\[data-section="results"\]\) \.fixtureRow > button \{ padding-inline-end: 86px;/,
    /\.fixture, \.selectedFixture \{[^}]*padding-inline: 11px 64px;[^}]*text-align: start;/,
    /\.fixtureScore \{[^}]*inset-inline-end: 47px;/,
    /\.fixtureAlert \{[^}]*inset-inline-end: 14px;/,
    /\.highlightDeck::after \{[^}]*inset-inline-end: -38px;/,
    /\.eventPoints \{[^}]*text-align: end;/,
    /\.eventPoints \{ grid-column: 2 \/ 4; justify-items: start; text-align: start;/,
    /\.shell \{[^}]*direction: ltr;/,
    /\.fixture:hover \{ transform: translateX\(3px\);/,
    /\.selectedFixture \{[^}]*inset 3px 0/,
    /\.fixture:focus-visible, \.selectedFixture:focus-visible \{ outline: 3px solid #d8ff94; outline-offset: 2px;/,
  ]) assert.match(css, pattern);

  assert.doesNotMatch(css, /\.fixtureScore \{[^}]*\bright:/);
  assert.doesNotMatch(css, /\.fixtureAlert \{[^}]*\bright:/);
  assert.doesNotMatch(css, /\.fixture, \.selectedFixture \{[^}]*text-align: left;/);
  assert.doesNotMatch(css, /:global\(\[dir="rtl"\]\) \.fixture:hover/);
  assert.doesNotMatch(css, /:global\(\[dir="rtl"\]\) \.selectedFixture/);
});
