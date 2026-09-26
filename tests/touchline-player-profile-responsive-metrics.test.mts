import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css=readFileSync(new URL("../app/touchline-players/[player]/player-profile.module.css",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/touchline-players/[player]/page.tsx",import.meta.url),"utf8");

test("short landscape keeps club beside identity and preserves the accessible club link",()=>{
  const compact=css.slice(css.indexOf("@media (orientation: landscape) and (max-height: 520px) and (min-width: 761px)"));
  assert.match(compact,/\.identityHeading \{ flex-direction: row;/);
  assert.match(compact,/\.identityCrest \{ width: 64px;/);
  assert.match(page,/aria-label=\{`\$\{text.openClub\}: \$\{club.name\}`\}/);
});

test("landscape identity facts reserve readable width instead of squeezing three columns",()=>{
  const landscape=css.slice(css.indexOf("@media (orientation: landscape)"));
  assert.match(landscape,/\.factGrid\s*\{\s*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 170px\), 1fr\)\)/);
  assert.match(css,/\.fact > div\s*\{\s*min-width: 0;\s*overflow-wrap: anywhere/);
});

test("desktop metadata allows whole position words without arbitrary word breaks",()=>{
  assert.match(css,/\.metrics\s*\{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 240px\), 1fr\)\)/);
  assert.match(css,/\.metrics strong\s*\{[^}]*overflow-wrap: normal/);
  assert.match(css,/\.metrics strong\s*\{[^}]*font-size: clamp\(22px, 1\.8vw, 28px\)/);
});

test("phone and tablet metrics use content-sized tracks after landscape rules",()=>{
  const adaptive=css.lastIndexOf("grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr))");
  assert.ok(adaptive>css.indexOf("@media (orientation: landscape)"));
  assert.match(css.slice(adaptive),/\.metrics strong\s*\{\s*overflow-wrap: normal/);
});

test("scores and currency stay intact without forcing all metadata onto one line",()=>{
  assert.match(css,/\.metrics \.numericMetric\s*\{\s*white-space: nowrap/);
  assert.match(page,/className=\{styles.numericMetric\}>\{cumulativeRatingText\}/);
  assert.match(page,/className=\{styles.numericMetric\}>\{displayedPriceText\}/);
  assert.match(css,/\.fixtureRating\s*\{\s*grid-column: 1 \/ -1;\s*white-space: nowrap/);
  assert.match(page,/className=\{styles.fixtureRating\}/);
});

test("official ratings retain readable width after all landscape column overrides",()=>{
  assert.match(css,/\.officialStats \.primaryStat strong\s*\{\s*white-space: nowrap;\s*overflow-wrap: normal/);
  assert.ok(css.lastIndexOf("grid-template-columns: repeat(auto-fit, minmax(min(100%, 128px), 1fr))")>css.indexOf("@media (orientation: landscape)"));
  assert.match(css,/\.officialStats,\s*\.officialStats\[data-stat-count\]\s*\{/);
});
