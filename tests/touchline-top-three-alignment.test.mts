import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { touchlinePlayerLeaderCrownStyle } from "../lib/touchlineArena/player-leader-crown-presentation.ts";

test("Top three share one card stage and reserve the crown without lowering its card", () => {
  const css = readFileSync(new URL("../app/touchline-tables/touchline-tables.module.css", import.meta.url), "utf8");
  assert.match(css, /\.podiumCard\s*\{[^}]*padding-top: 44px;/);
  assert.match(css, /\.podiumCard :global\(\[data-card-leadership-crown="true"\]\)\s*\{\s*margin-top: 0 !important;/);
  assert.match(css, /\.playerPodium li\s*\{[^}]*align-content: start;/);
  const tablet = css.slice(css.indexOf("@media (max-width: 860px)"), css.indexOf("@media (max-width: 680px)"));
  assert.match(tablet, /\.rankingHighlights\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.playerPodium\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  const reserve = Number(css.match(/\.podiumCard\s*\{[^}]*padding-top: (\d+)px;/)?.[1]);
  assert.ok(reserve >= -touchlinePlayerLeaderCrownStyle(150 / 430).top,
    "Shared stage must contain the calibrated crown at the largest podium card width");
});
