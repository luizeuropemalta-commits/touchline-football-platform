import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../components/touchline/match-centre/touchline-match-centre.module.css", import.meta.url), "utf8");
const component = readFileSync(new URL("../components/touchline/match-centre/TouchlineMatchCentre.tsx", import.meta.url), "utf8");

test("Live hero sizes to its text and media content without clipping", () => {
  const hero = css.match(/(?:^|\n)\.hero\s*\{([^}]*)\}/)?.[1];
  assert.ok(hero);
  assert.doesNotMatch(hero, /aspect-ratio:/);
  assert.match(hero, /overflow:\s*hidden\s*;/, "decorative pitch still clipped to rounded perimeter");
  assert.doesNotMatch(hero, /(?:^|;)\s*(?:height|block-size|min-height|min-block-size|max-height|max-block-size):/);
  // Narrow-screen overrides may change padding/radius, not add a height clamp.
  const heroBlocks = [...css.matchAll(/(?:^|[}\s])\.hero\s*\{([^}]*)\}/g)].map(match => match[1]);
  for (const block of heroBlocks.slice(1)) assert.doesNotMatch(block, /(?:min-)?(?:height|block-size):/);
});

test("both Live status outputs remain present rather than hidden to mask clipping", () => {
  assert.match(component, /className=\{styles\.statusPill\} role="status"/);
  assert.match(component, /<strong className=\{styles\.countdown\}>/);
  for (const selector of ["statusPill", "countdown"]) {
    const rules = [...css.matchAll(new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`, "g"))];
    assert.ok(rules.length);
    for (const [, body] of rules) assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|font-size:\s*0(?:px)?\s*;/);
  }
});

test("long rail status wraps within its column without hiding words or crests", () => {
  const rule = css.match(/\.fixtureCentre small\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /max-width:\s*100%/);
  assert.match(rule, /white-space:\s*normal/);
  assert.match(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /text-overflow:\s*ellipsis|overflow:\s*hidden|display:\s*none/);
});

test("Arabic direction belongs to text surfaces while shell and team geometry remain LTR", () => {
  assert.match(component, /const textDirection = language === "ar-SA" \? "rtl" : "ltr"/);
  assert.match(component, /data-testid="touchline-match-centre" lang=\{language\}/);
  assert.match(component, /<span dir=\{textDirection\}>/);
  assert.match(component, /className=\{styles\.railLeague\} dir=\{textDirection\}/);
  assert.match(component, /className=\{styles\.venueCopy\} dir=\{textDirection\}/);
  assert.match(component, /<p dir=\{textDirection\}>\{dictionary\.dataPending\}/);
  assert.match(component, /<article dir=\{textDirection\}>/);
  for (const layout of ["shell", "layout", "hero", "heroTeams", "fixtureStack", "fixtureTeams", "infoGrid"]) {
    assert.doesNotMatch(component, new RegExp(`className=\\{styles\\.${layout}\\}[^>]*dir=\\{textDirection\\}`));
  }
  assert.match(css, /\.shell \{[^}]*direction: ltr/);
});
