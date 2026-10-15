import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("compact coach award follows its canonical card tier, including the neutral pending state", () => {
  const source = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
  const panelStart = source.indexOf('function TopCoachAward');
  const panelEnd = source.indexOf('export function TouchlineCoachRankingTable');
  assert.ok(panelStart >= 0 && panelEnd > panelStart);
  const panel = source.slice(panelStart, panelEnd);
  assert.match(panel, /data-coach-tier-frame=\{topCoachSlot\?\.cardTier \?\? "unresolved"\}/);
  assert.match(panel, /"--tier-accent": topCoachSlot \? touchlineCardTierPalette\(topCoachSlot\.cardTier\)\.accent : undefined/);
  assert.match(panel, /TouchlineClubPerimeterTrace accent=\{topCoachSlot \? touchlineCardTierPalette\(topCoachSlot\.cardTier\)\.accent : undefined\}/);
  const css = readFileSync(new URL("../app/rankings/touchline-tables.module.css", import.meta.url), "utf8");
  assert.match(css, /\.awardEntry,\s*\.awardPlaceholder\s*\{[^}]*--touchline-perimeter-radius: 20px/);
  assert.match(css, /\.awardCoachCardLink\s*\{[^}]*width: min\(126px, 68%\)/);
  assert.match(css, /\.awardEntry,\s*\.awardPlaceholder\s*\{[^}]*color-mix\(in srgb, var\(--tier-accent/);
});

test("awards use fixed semantic slots rather than a fabricated top-three ranking", () => {
  const source = readFileSync(new URL("../app/rankings/touchline-tables-client.tsx", import.meta.url), "utf8");
  const podiumStart = source.indexOf('export function TouchlineRankingPodium');
  const podiumEnd = source.indexOf('export function TouchlineRankingEnding');
  assert.ok(podiumStart >= 0 && podiumEnd > podiumStart);
  const podium = source.slice(podiumStart, podiumEnd);
  assert.match(podium, /data-ranking-award="best-player"/);
  assert.match(podium, /data-ranking-award="golden-boot"/);
  assert.match(podium, /TopCoachAward/);
  assert.match(podium, /touchline-golden-ball-trophy-v2\.png/);
  const css = readFileSync(new URL("../app/rankings/touchline-tables.module.css", import.meta.url), "utf8");
  assert.match(css, /--touchline-perimeter-radius: 20px/);
  assert.match(css, /radial-gradient\(circle at 50% 4%, color-mix\(in srgb, var\(--tier-accent/);
  assert.doesNotMatch(css, /\.playerPodium li:first-child\s*\{[^}]*background:/);
});
