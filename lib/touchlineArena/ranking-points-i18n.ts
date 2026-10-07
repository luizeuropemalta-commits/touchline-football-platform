import { resolveTouchlineCatalogueLocale } from "./catalogue-locale.ts";

// Draft editorial labels only. In particular, the numeric-plus-dual form
// "2 نقطتان" still requires independent linguistic/visual review.
// This helper never enables a locale or changes the numeric score.
const arabicLabels: Readonly<Record<Intl.LDMLPluralRule, string>> = {
  zero: "نقطة",
  one: "نقطة",
  two: "نقطتان",
  few: "نقاط",
  many: "نقطة",
  other: "نقطة",
};

// Avoid the default fraction-digit rounding turning 3.0001 into category few.
// 21 significant digits covers the precision of a finite JavaScript number.
const arabicCardinals = new Intl.PluralRules("ar-SA", {
  type: "cardinal",
  maximumSignificantDigits: 21,
});

export function touchlineRankingPointsLabel(
  value: number,
  locale: string,
  fallbackLabel: string,
  draftLocalesEnabled = false,
): string {
  if (resolveTouchlineCatalogueLocale(locale, draftLocalesEnabled) !== "ar-SA"
    || !Number.isFinite(value)) return fallbackLabel;
  return arabicLabels[arabicCardinals.select(value)];
}
