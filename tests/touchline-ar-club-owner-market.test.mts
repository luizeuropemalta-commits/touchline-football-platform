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
  plan: "خطتي", planStandard: "قياسي", planPro: "PRO", planActive: "نشط", planInactive: "غير نشط", marketPower: "قوة السوق", marketPowerUnavailable: "قوة السوق غير متاحة", activatePlan: "تفعيل الخطة", renewPlan: "تجديد",
  proMember: "عضو PRO", proAccess: "وصول PRO", proPrivileges: "مزايا العضو الحصرية",
  planUntil: "صالح حتى {date}", planActiveNoEnd: "خطتك نشطة.", planInactiveDetail: "فعّل خطة لإدارة تشكيلتك الأساسية.", planStandardPrice: "49.90 € لكل موسم", planStandardBenefit: "وصول كامل إلى اللعبة والترتيب.", planProPrice: "89.90 € لكل موسم", planProBenefit: "مظهر مميز وسجل وتقارير وتنبيهات.",
  planActionUnavailable: "تفعيل الخطة وتجديدها غير متاحين بعد.", virtualBudgetSeparate: "تبقى ميزانية تشكيلتك الأساسية منفصلة عن خطتك.",
} as const;

test("Arabic ClubOwner plan copy preserves approved prices, unavailable payments and the date template", () => {
  assert.deepEqual(TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES["ar-SA"], ar);
  for (const [key, value] of Object.entries(ar)) {
    assert.ok(value.trim(), `${key} must not be empty`);
    const text = key === "planUntil" ? value.replace("{date}", "") : value;
    assert.doesNotMatch(text, /TODO|FIXME|\[(?:translate|missing)\]|\{[^}]+\}/i, `${key} unresolved marker`);
    if (key !== "planStandardPrice" && key !== "planProPrice") assert.doesNotMatch(value, /€|£|\b(?:GBP|BRL|USD|SAR)\b|9[,.]99/);
    if (key !== "planPro") assert.match(text, /[\u0600-\u06ff]/, `${key} must contain Arabic presentation text`);
  }
  assert.equal(ar.planPro, "PRO");
  assert.match(ar.planActionUnavailable, /غير متاح/);
  assert.match(ar.virtualBudgetSeparate, /منفصلة/);
});

test("Arabic ClubOwner Market copy remains an unpublished draft behind the EN/PT gate", () => {
  assert.equal(TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_STATUS, "draft");
  assert.ok(TOUCHLINE_CLUB_OWNER_MARKET_DRAFT_LOCALES.includes("ar-SA"));
  assert.equal(i18n.isTouchLineLocaleComplete("ar-SA"), false);
  assert.deepEqual(getTouchlineClubOwnerMarketCopy("ar-SA"), TOUCHLINE_CLUB_OWNER_MARKET_CATALOGUES["en-GB"]);
});
