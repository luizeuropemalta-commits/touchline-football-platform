import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/touchline-coaches/[coach]/page.tsx", "utf8");

test("coach profile groups identity beside a compact complete card instead of a centred empty hero", () => {
  assert.match(source, /\.coach-profile-hero \{[^}]*align-items:start/);
  assert.match(source, /\.coach-profile-card \{ width:min\(100%,300px\);[^}]*padding-top:0;[^}]*overflow:visible/);
  assert.match(source, /\.coach-profile-card:has\(> \[data-coach-ranking-leader="true"\]\) \{ padding-top:96px/);
  assert.match(source, /\.coach-profile-grid \{[^}]*margin-top:24px/);
  assert.doesNotMatch(source, /\.coach-profile-card \{[^}]*order:-1/);
});

test("compact coach card reserves the calibrated crown height without changing its artwork", () => {
  // Coach artwork is 2:3; approved crown reaches 19.7% above its height.
  for (const [width, reserved] of [[300, 96], [280, 84]]) {
    assert.ok(reserved >= width * 1.5 * .197);
  }
  assert.match(source, /width:min\(100%,280px\)/);
  assert.match(source, /padding-top:84px/);
  assert.match(source, /\.coach-profile-card > \[data-coach-ranking-leader="true"\] \{ margin-top:0 !important/);
  assert.match(source, /showLeadershipCrown=\{competition\?\.rank === 1\}/);
});

test("tablet and desktop performance follow identity without waiting for the taller portrait", () => {
  assert.match(source, /className="coach-profile-composition"/);
  assert.match(source, /@media \(min-width:761px\)/);
  const desktop = source.slice(source.indexOf("@media (min-width:761px)"), source.indexOf("@media (max-width:760px)"));
  assert.match(desktop, /\.coach-profile-hero,\.coach-profile-grid \{ display:contents; \}/);
  assert.match(desktop, /\.coach-profile-copy \{ grid-column:1; grid-row:1; \}/);
  assert.match(desktop, /\.coach-profile-game-card \{ grid-column:1; grid-row:2; \}/);
  assert.match(desktop, /\.coach-profile-card \{ grid-column:2; grid-row:1 \/ 3; \}/);
  assert.match(desktop, /\.coach-profile-facts \{ grid-column:1 \/ -1; grid-row:3; \}/);
  assert.equal(source.match(/<TouchlineCoachPerformance /g)?.length, 1);
  assert.equal(source.match(/<TouchlineCoachCard\s/g)?.length, 1);
});
