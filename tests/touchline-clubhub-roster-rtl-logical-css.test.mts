import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const technicalCss = read("components/touchline/ClubHubMatchdayTechnicalArea.module.css");
const rosterCss = read("components/touchline/ClubHubOutsideMatchRoster.module.css");

function rule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing ${selector} rule`);
  return match[1];
}

test("ClubHub technical status keeps its LTR end/start intent through logical text alignment", () => {
  assert.match(rule(technicalCss, ".status"), /text-align:\s*end/);
  assert.doesNotMatch(rule(technicalCss, ".status"), /text-align:\s*right/);
  const mobileStatus = technicalCss.match(/@media \(max-width: 800px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(mobileStatus, /\.status\s*\{[^}]*text-align:\s*start/);
  assert.doesNotMatch(mobileStatus, /\.status\s*\{[^}]*text-align:\s*left/);
});

test("ClubHub bench ordinal uses the reading-order inline edge, not a physical left edge", () => {
  const cardNumber = rule(technicalCss, ".cardNumber");
  assert.match(cardNumber, /inset-inline-start:\s*5px/);
  assert.doesNotMatch(cardNumber, /\bleft\s*:/);

  const source = read("components/touchline/ClubHubMatchdayTechnicalArea.tsx");
  assert.match(source, /bench\.map\(\(card, index\)/);
  assert.match(source, /<span className=\{styles\.cardNumber\}>\{index \+ 1\}<\/span>/);
});

test("ClubHub outside-roster position labels follow the logical inline end", () => {
  const position = rule(rosterCss, ".position");
  assert.match(position, /text-align:\s*end/);
  assert.doesNotMatch(position, /text-align:\s*right/);
});
