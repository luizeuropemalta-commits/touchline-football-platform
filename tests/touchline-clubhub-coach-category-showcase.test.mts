import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { TOUCHLINE_COACH_TIER_GALLERY } from "../lib/touchlineArena/coach-tier-gallery.ts";

const component = readFileSync(
  new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("../app/touchline-clubs/page.tsx", import.meta.url), "utf8");

test("ClubHub exposes exactly seven decorative coach category frames without coach or market claims", () => {
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

  assert.match(component, /Static, non-interactive framework/);
  assert.match(component, /alt=""/);
  assert.match(component, /<ul className=\{styles\.grid\}>/);
  assert.doesNotMatch(component, /TOUCHLINE_DEMO_COACH|TOUCHLINE_LIVE_COACHES|competition-card-offer|providerId|retailPrice|touchCredit|\bfetch\(/);
});

test("the public ClubHub keeps the coach framework after the shared official table", () => {
  assert.match(page, /<TouchlineOfficialLeagueTable[\s\S]*?\/>[\s\S]*?<TouchlineCoachCategoryShowcase locale=\{locale\} \/>/);
});
