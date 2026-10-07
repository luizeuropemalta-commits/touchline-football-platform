import assert from "node:assert/strict";
import test from "node:test";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES,
  TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_LOCALES,
  TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_STATUS,
  getTouchlineClubHubSectionNavigationCopy,
} from "../lib/touchlineArena/club-hub-section-navigation-i18n.ts";

const ar = {
  table: "الترتيب",
  matchday: "يوم المباراة",
  squad: "قائمة الفريق",
  sectionsAria: "أقسام ClubHub",
  backToTop: "العودة إلى الأعلى",
  top: "الأعلى",
} as const;

test("Arabic ClubHub section labels are complete and preserve the protected product name", () => {
  assert.deepEqual(TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES["ar-SA"], ar);
  for (const [key, value] of Object.entries(ar)) {
    assert.ok(value.trim(), `${key} must not be empty`);
    assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]|\{[^}]+\}/i, `${key} must not have a placeholder`);
    assert.match(value.replaceAll("ClubHub", ""), /[\u0600-\u06ff]/, `${key} must have Arabic presentation text`);
  }
  assert.match(ar.sectionsAria, /ClubHub/);
});

test("Arabic ClubHub section labels remain behind the canonical EN/PT publication gate", () => {
  assert.equal(TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_STATUS, "draft");
  assert.ok(TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_DRAFT_LOCALES.includes("ar-SA"));
  assert.equal(i18n.isTouchLineLocaleComplete("ar-SA"), false);
  assert.deepEqual(getTouchlineClubHubSectionNavigationCopy("ar-SA"), TOUCHLINE_CLUB_HUB_SECTION_NAVIGATION_CATALOGUES["en-GB"]);
});
