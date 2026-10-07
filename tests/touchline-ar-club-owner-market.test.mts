import assert from "node:assert/strict";
import test from "node:test";
import * as i18n from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES,
  TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_LOCALES,
  TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_STATUS,
  getTouchlineClubOwnerMarketCopy,
} from "../lib/touchlineArena/club-owner-market-i18n.ts";

const ar = {
  nameUnavailable: "الاسم غير متاح", photoAria: "تغيير صورة الملف الشخصي — غير متاح", photoUnavailable: "تحديث الصورة غير متاح بعد",
  yourProfile: "ملفك الشخصي", location: "الموقع", nationality: "الجنسية", memberSince: "عضو منذ", watchIntro: "مشاهدة المقدمة",
  bank: "البنك", inactive: "غير نشط", credits: "أرصدة TouchLine",
  purchasesUnavailable: "شراء الأرصدة غير متاح بعد. لا يمكن إجراء أي دفعة في هذا القسم.", buyCredits: "شراء الأرصدة",
  notCreditBalance: "تظهر أدناه ميزانية تشكيلتك الأساسية ونقاطك. وهي ليست رصيدًا من الأرصدة.",
} as const;

test("Arabic ClubOwner Market copy is complete without payment, currency, or placeholder invention", () => {
  assert.deepEqual(TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES["ar-SA"], ar);
  for (const [key, value] of Object.entries(ar)) {
    assert.ok(value.trim(), `${key} must not be empty`);
    assert.doesNotMatch(value, /TODO|FIXME|\[(?:translate|missing)\]|\{[^}]+\}/i, `${key} unresolved marker`);
    assert.doesNotMatch(value, /€|£|\b(?:GBP|BRL|USD|SAR)\b|9[,.]99/);
    assert.match(value.replaceAll("TouchLine", ""), /[\u0600-\u06ff]/, `${key} must contain Arabic presentation text`);
  }
  assert.match(ar.credits, /TouchLine/);
  assert.match(ar.purchasesUnavailable, /غير متاح/);
  assert.match(ar.notCreditBalance, /ليست/);
});

test("Arabic ClubOwner Market copy remains an unpublished draft behind the EN/PT gate", () => {
  assert.equal(TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_STATUS, "draft");
  assert.ok(TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_LOCALES.includes("ar-SA"));
  assert.equal(i18n.isTouchLineLocaleComplete("ar-SA"), false);
  assert.deepEqual(getTouchlineClubOwnerMarketCopy("ar-SA"), TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES["en-GB"]);
});
