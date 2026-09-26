import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("featured coach frame follows its canonical card tier, including the neutral pending state", () => {
  const source = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
  const panel = source.slice(source.indexOf('<aside className={styles.topCoachPanel}'), source.indexOf('className={styles.rankingHighlights}'));
  assert.match(panel, /data-coach-tier-frame=\{topCoachSlot\?\.cardTier \?\? "unresolved"\}/);
  assert.match(panel, /"--tier-accent": topCoachSlot \? touchlineCardTierPalette\(topCoachSlot\.cardTier\)\.accent : undefined/);
  assert.match(panel, /TouchlineClubPerimeterTrace accent=\{topCoachSlot \? touchlineCardTierPalette\(topCoachSlot\.cardTier\)\.accent : undefined\}/);
  const css = readFileSync(new URL("../app/touchline-tables/touchline-tables.module.css", import.meta.url), "utf8");
  assert.match(css, /\.topCoachPanel\s*\{[^}]*--touchline-perimeter-radius: 26px/);
  assert.match(css, /\.topCoachPanel::before\s*\{\s*content: none/);
  assert.match(css, /\.topCoachBody\s*\{[^}]*var\(--tier-accent, #9eaaa5\)/);
});

test("podium frames use the published card tier, never the podium position, for their living perimeter", () => {
  const source = readFileSync(new URL("../app/touchline-tables/touchline-tables-client.tsx", import.meta.url), "utf8");
  const podium = source.slice(source.indexOf("{topPlayerCards.map"), source.indexOf('<aside className={styles.coachRankingPanel}'));
  assert.match(podium, /card\.editorialCard\?\.tierKey/);
  assert.match(podium, /touchlineCardTierPalette\(tierKey\)/);
  assert.match(podium, /TouchlineClubPerimeterTrace accent=\{palette\?\.accent\}/);
  assert.match(podium, /"--tier-accent": palette\?\.accent/);
  const css = readFileSync(new URL("../app/touchline-tables/touchline-tables.module.css", import.meta.url), "utf8");
  assert.match(css, /--touchline-perimeter-radius: 20px/);
  assert.match(css, /radial-gradient\(circle at 50% 4%, color-mix\(in srgb, var\(--tier-accent/);
  assert.doesNotMatch(css, /\.playerPodium li:first-child\s*\{[^}]*background:/);
});
