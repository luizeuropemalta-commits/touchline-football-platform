import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
const css = source.split("<style>{`")[1].split("`}</style>")[0];
const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];

test("ClubHub reserves independent in-flow areas for identity, next match and honours", () => {
  assert.match(rule(".club-hub-hero"), /display: grid/);
  assert.match(rule(".club-hub-hero"), /grid-template-areas: "identity match" "honours honours"/);
  assert.match(rule(".club-hub-identity"), /grid-area: identity/);
  for (const [selector, area] of [[".club-hub-hero-next-match", "match"], [".club-hub-hero-footer", "honours"]]) {
    assert.match(rule(selector), new RegExp(`grid-area: ${area}`));
    assert.match(rule(selector), /position: relative/);
    assert.doesNotMatch(rule(selector), /position: absolute|(?:top|right|bottom|left):/);
  }
});

test("tablet stacks named areas and compact landscape never restores the three-child flex row", () => {
  const tablet = css.split("@media (max-width: 980px)")[1].split("@media")[0];
  const landscape = css.split("@media (orientation: landscape)")[1].split("@media")[0];
  assert.match(tablet, /grid-template-areas: "identity" "match" "honours"/);
  assert.match(landscape, /grid-template-areas: "identity match" "honours honours"/);
  assert.doesNotMatch(landscape, /\.club-hub-hero,\s*\.club-hub-identity/);
  assert.match(rule(".club-hub-identity h1"), /overflow-wrap: anywhere/);
});

test("small landscape phones reserve the full row for legible club identity", () => {
  const small = css.split("@media (orientation: landscape) and (max-width: 720px) and (max-height: 520px)")[1]?.split("@media")[0];
  assert.ok(small, "small landscape needs an explicit readable layout");
  assert.match(small, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(small, /grid-template-areas: "identity" "match" "honours"/);
  assert.match(small, /\.club-hub-logo-stack\s*\{\s*width: 136px/);
});
