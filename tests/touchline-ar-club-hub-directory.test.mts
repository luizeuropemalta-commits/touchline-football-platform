import assert from "node:assert/strict";
import test from "node:test";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES,
  TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_LOCALES,
  TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_STATUS,
  getTouchlineClubHubDirectoryCopy,
} from "../lib/touchlineArena/club-hub-directory-i18n.ts";

const ar = {
  intro: "ادخل إلى ClubHub الرسمي لكل فريق، واطّلع على معلومات النادي الفعلية وتابع بطاقات TouchLine، دون الانتقال مباشرة إلى نادٍ محدد.",
  open: "فتح ClubHub",
  clubs: "20 ناديًا",
  hint: "مجموعة مميزة من الأندية",
  openingClub: "جارٍ فتح ClubHub",
  loadingCards: "جارٍ تحميل البطاقات…",
} as const;

test("Arabic ClubHub directory copy is complete while protected product names remain literal", () => {
  assert.deepEqual(TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES["ar-SA"], ar);
  for (const [key, value] of Object.entries(ar)) {
    assert.ok(value.trim(), `${key} must not be empty`);
    assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]|\{[^}]+\}/i, `${key} must not contain an unresolved placeholder`);
    assert.match(value.replaceAll("ClubHub", "").replaceAll("TouchLine", ""), /[\u0600-\u06ff]/, `${key} must include Arabic presentation text`);
  }
  assert.match(ar.intro, /ClubHub/); assert.match(ar.intro, /TouchLine/);
  assert.match(ar.clubs, /^20 /);
});

test("Arabic directory copy remains an unpublished draft behind the existing EN/PT gate", () => {
  assert.equal(TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_STATUS, "draft");
  assert.ok(TOUCHLINE_CLUB_HUB_DIRECTORY_DRAFT_LOCALES.includes("ar-SA"));
  assert.equal(i18n.isTouchLineLocaleComplete("ar-SA"), false);
  assert.deepEqual(getTouchlineClubHubDirectoryCopy("ar-SA"), TOUCHLINE_CLUB_HUB_DIRECTORY_CATALOGUES["en-GB"]);
});
