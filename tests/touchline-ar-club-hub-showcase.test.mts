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
  assert.equal(Object.keys(ar).length, 15);
  assert.deepEqual(Object.keys(ar).sort(), Object.keys(TOUCHLINE_CLUB_HUB_SHOWCASE_CATALOGUES["en-GB"]).sort());
  for (const [key, value] of Object.entries(ar)) {
    assert.ok(value.trim(), `${key} must not be empty`);
    const placeholders = value.match(/\{\w+\}/g) ?? [];
    assert.deepEqual(placeholders, [], `${key} current top-seven copy has no placeholders`);
    assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]/i, `${key} unresolved marker`);
    const localized = value.replaceAll("TouchLine", "");
    assert.doesNotMatch(localized, /[A-Za-z]/, `${key} must not retain an unapproved Latin fallback`);
    assert.match(localized, /[\u0600-\u06ff]/, `${key} must contain Arabic presentation text`);
  }
  assert.match(ar.playerEyebrow, /TouchLine/);
  assert.match(ar.coachEyebrow, /TouchLine/);
  assert.doesNotMatch(JSON.stringify(ar), /Erling Haaland|\{tierName\}/, "the current ranking must not retain the superseded fixed-player showcase copy");
});

test("Arabic ClubHub showcase remains a draft behind the canonical EN/PT getter gate", () => {
  assert.equal(TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_STATUS, "draft");
  assert.ok(TOUCHLINE_CLUB_HUB_SHOWCASE_DRAFT_LOCALES.includes("ar-SA"));
  assert.equal(i18n.isTouchLineLocaleComplete("ar-SA"), false);
  assert.deepEqual(getTouchlineClubHubShowcaseCopy("ar-SA"), getTouchlineClubHubShowcaseCopy("en-GB"));
});
