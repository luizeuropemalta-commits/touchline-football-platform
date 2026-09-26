import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ranking coach panel follows content without duplicating the canonical crown clearance", () => {
  const css = readFileSync(new URL("../app/touchline-tables/touchline-tables.module.css", import.meta.url), "utf8");
  const card = readFileSync(new URL("../components/touchline/cards/TouchlineCoachCard.tsx", import.meta.url), "utf8");
  const panelRules = Array.from(css.matchAll(/\.topCoachPanel\s*\{([^}]*)\}/g), match => match[1]);
  assert.ok(panelRules.some(rule => /align-self:\s*start;/.test(rule)
    && /grid-template-rows:\s*auto auto;/.test(rule)), "panel must fit its content without duplicating crown clearance");
  assert.match(css, /\.topCoachBody\s*\{[^}]*align-content: start;/);
  assert.match(css, /\.topCoachCardLink\s*\{[^}]*margin-top: 0;/);
  assert.match(card, /marginTop: showLeadershipCrown \? "29\.55%"/);
  assert.doesNotMatch(css, /\.topCoachCardLink[^}]*margin-top: clamp/);
});

test("short landscape coach panel uses its spare width for identity without shrinking the card envelope", () => {
  const css = readFileSync(new URL("../app/touchline-tables/touchline-tables.module.css", import.meta.url), "utf8");
  const landscape = css.slice(css.indexOf("@media (max-width: 1000px) and (max-height: 520px)"));
  assert.match(landscape, /grid-template-columns: minmax\(0, 160px\) minmax\(0, 240px\)/);
  assert.match(landscape, /\.topCoachCardLink\s*\{\s*width: 100%/);
  assert.match(landscape, /\.topCoachIdentity\s*\{[^}]*text-align: left/);
  assert.doesNotMatch(landscape, /max-height:.*?;/);
});
