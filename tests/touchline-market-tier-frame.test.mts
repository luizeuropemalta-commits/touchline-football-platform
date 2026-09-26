import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("short landscape choice panels retain scrollable content instead of collapsing below their headers", () => {
  const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  const landscape = css.slice(css.indexOf("@media (orientation:landscape) and (max-width:1100px) and (max-height:520px)"));
  assert.match(landscape, /\.guidePanel\[data-guide-step=players\],\.guidePanel\[data-guide-step=coach\]\{height:auto;max-height:none\}/);
  assert.match(landscape, /\.playerViewport\{flex:none;height:340px\}/);
  assert.match(landscape, /\.coachScroller\{flex:none;max-height:340px\}/);
  assert.match(landscape, /\.coachGrid>article\{grid-template-columns:minmax\(0,1fr\);grid-template-areas:"card" "identity" "metrics" "action"/);
  assert.match(landscape, /\.coachIdentity>b\{white-space:normal;overflow:visible\}/);
});

test("coach choice and selected summary use the same canonical slot tier as their artwork", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  assert.match(source, /data-coach-tier-frame=\{selectedCoach\.slot\.cardTier\}/);
  assert.match(source, /data-coach-tier-frame=\{entry\.slot\.cardTier\}/);
  assert.match(source, /TouchlineClubPerimeterTrace accent=\{touchlineCardTierPalette\(selectedCoach\.slot\.cardTier\)\.accent\}/);
  assert.match(source, /TouchlineClubPerimeterTrace accent=\{touchlineCardTierPalette\(entry\.slot\.cardTier\)\.accent\}/);
});

test("slot player chooser also uses its published tier without changing selection controls", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const chooser = source.slice(source.indexOf('<div className={styles.playerGrid}>'), source.indexOf('{visibleStep === "review"'));
  assert.match(chooser, /data-choice-tier-frame=\{card\.editorialCard\?\.tierKey \?\? "unresolved"\}/);
  assert.match(chooser, /TouchlineClubPerimeterTrace accent=\{card\.editorialCard\?\.tierKey/);
  assert.match(chooser, /displayWidth=\{132\} fitContainer/);
  assert.match(chooser, /disabled=\{!editable\} onClick=\{\(\) => addPlayer\(card\)\}/);
});

test("canonical market frames reuse tier perimeter without changing selection controls", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx", import.meta.url), "utf8");
  const cards = source.slice(source.indexOf('id="my-club-position-results"'), source.indexOf('<footer className={styles.myClubGameweekFooter}'));
  assert.match(cards, /card\.editorialCard\?\.tierKey/);
  assert.match(cards, /data-market-tier-frame=\{tierKey \?\? "unresolved"\}/);
  assert.match(cards, /TouchlineClubPerimeterTrace accent=\{palette\?\.accent\}/);
  assert.match(cards, /!editable \? <span/);
  assert.match(cards, /onClick=\{\(\) => selectMyClubPlayer\(card\)\}/);
  const css = readFileSync(new URL("../app/fantasy/fantasy.module.css", import.meta.url), "utf8");
  assert.match(css, /--touchline-perimeter-radius:13px;position:relative;isolation:isolate/);
  assert.match(css, /var\(--tier-accent,#83918b\) 18%/);
});
