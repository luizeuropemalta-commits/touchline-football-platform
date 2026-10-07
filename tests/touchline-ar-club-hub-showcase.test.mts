import assert from "node:assert/strict";
import test from "node:test";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES,
  TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES,
  TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS,
  getTouchlineClubHubShowcaseCopy,
} from "../lib/touchlineArena/club-hub-showcase-i18n.ts";

const ar = TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES["ar-SA"];

test("Arabic ClubHub showcase copy is complete and keeps only intentional protected literals", () => {
  assert.equal(Object.keys(ar).length, 18);
  for (const [key, value] of Object.entries(ar)) {
    assert.ok(value.trim(), `${key} must not be empty`);
    const placeholders = value.match(/\{\w+\}/g) ?? [];
    assert.deepEqual(placeholders, key === "playerDescription" ? ["{tierName}"] : [], `${key} placeholder contract`);
    assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]/i, `${key} unresolved marker`);
    const localized = value.replaceAll("TouchLine", "").replaceAll("Erling Haaland", "").replaceAll("{tierName}", "");
    assert.match(localized, /[\u0600-\u06ff]/, `${key} must contain Arabic presentation text`);
  }
  assert.match(ar.playerEyebrow, /TouchLine/);
  assert.match(ar.coachEyebrow, /TouchLine/);
  assert.match(ar.playerDescription, /Erling Haaland/);
  assert.match(ar.playerDescription, /\{tierName\}/);
});

test("Arabic ClubHub showcase remains a draft behind the canonical EN/PT getter gate", () => {
  assert.equal(TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS, "draft");
  assert.ok(TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES.includes("ar-SA"));
  assert.equal(i18n.isTouchLineLocaleComplete("ar-SA"), false);
  assert.deepEqual(getTouchlineClubHubShowcaseCopy("ar-SA"), getTouchlineClubHubShowcaseCopy("en-GB"));
});
