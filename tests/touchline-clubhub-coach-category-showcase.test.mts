import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_COACH_TIER_GALLERY } from "../lib/touchlineArena/coach-tier-gallery.ts";

const component = readFileSync(
  new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");

test("ClubHub exposes the seven canonical player and coach borders with real representative boundaries", () => {
  assert.equal(TOUCHLINE_COACH_TIER_GALLERY.length, 7);
  assert.equal(new Set(TOUCHLINE_COACH_TIER_GALLERY.map((item) => item.tierKey)).size, 7);

  for (const item of TOUCHLINE_COACH_TIER_GALLERY) {
    assert.match(item.compactArtUrl, /^\/touchlineArena\/cards\/templates\/live-compact\/coaches\/.+\.webp$/);
    assert.equal(
      existsSync(new URL(`../public${item.compactArtUrl}`, import.meta.url)),
      true,
      `missing local coach category asset for ${item.tierKey}`,
    );
  }

  assert.match(component, /alt=""/);
  assert.equal((component.match(/<ul className=\{styles\.grid\}/g) ?? []).length, 2);
  assert.match(component, /selectTouchlinePlayerTierRepresentatives\(playerCards\)/);
  assert.match(component, /selectTouchlineCoachTierRepresentatives\(\)/);
  assert.match(component, /TouchlineEliteExactCard/);
  assert.match(component, /TouchlineCoachCard/);
  assert.match(component, /dictionary\.representativePendingDescription/);
  assert.doesNotMatch(component, /TOUCHLINE_DEMO_COACH|competition-card-offer|retailPrice|touchCredit|\bfetch\(/);
});

test("the public ClubHub keeps language selection at the top and player borders before coach borders without the league table", () => {
  assert.match(page, /<details className=\{styles\.languageMenu\}>/);
  assert.match(page, /href="\/touchline-clubs\?lang=en-GB"/);
  assert.match(page, /href="\/touchline-clubs\?lang=pt-BR"/);
  assert.match(page, /loadTouchlinePublishedCardShowcaseCatalog\(\)/);
  assert.match(page, /<TouchlineCoachCategoryShowcase locale=\{locale\} playerCards=\{publishedPlayerCards\} \/>/);
  assert.doesNotMatch(page, /TouchlineOfficialLeagueTable|loadTouchlineOfficialLeagueTable|official-league-table/);

  const playerSection = component.indexOf("touchline-player-border-title");
  const coachSection = component.indexOf("touchline-coach-border-title");
  assert.ok(playerSection >= 0);
  assert.ok(coachSection > playerSection);
});
