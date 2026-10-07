import assert from "node:assert/strict";
import test from "node:test";
import { getTouchlinePlayerPerformanceCopy, TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES } from "../lib/touchlineArena/player-performance-i18n.ts";
import { getTouchlineCardMatchFactLabels, TOUCHLINE_CARD_MATCH_FACT_CATALOGUES } from "../lib/touchlineArena/card-match-fact-i18n.ts";
import { buildTouchlineVerifiedMatchFactFields } from "../lib/touchlineArena/card-zoom-details.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const locales = ["en-GB", "pt-BR", "es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;

test("Rankings shared copy opts into eight catalogues without opening default gates", () => {
  for (const locale of locales) {
    const fallback = locale === "pt-BR" ? "pt-BR" : "en-GB";
    assert.equal(getTouchlinePlayerPerformanceCopy(locale), TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES[fallback]);
    assert.equal(getTouchlineCardMatchFactLabels(locale), TOUCHLINE_CARD_MATCH_FACT_CATALOGUES[fallback]);
    assert.equal(getTouchlinePlayerPerformanceCopy(locale, true), TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES[locale]);
    assert.equal(getTouchlineCardMatchFactLabels(locale, true), TOUCHLINE_CARD_MATCH_FACT_CATALOGUES[locale]);
    assert.equal(getTouchlinePlayerPerformanceCopy(locale, false), getTouchlinePlayerPerformanceCopy(locale));
    assert.equal(getTouchlineCardMatchFactLabels(locale, false), getTouchlineCardMatchFactLabels(locale));
    assert.equal(isTouchLineLocaleComplete(locale), locale === "en-GB" || locale === "pt-BR");
    const coverage = getTouchlinePlayerPerformanceCopy(locale, true).partialCoverage(3, 17);
    assert.ok(coverage.includes("3") && coverage.includes("17"));
  }
  for (const invalid of [undefined, null, "", "invalid", "constructor", "__proto__"]) {
    assert.equal(getTouchlinePlayerPerformanceCopy(invalid, true), TOUCHLINE_PLAYER_PERFORMANCE_CATALOGUES["en-GB"]);
    assert.equal(getTouchlineCardMatchFactLabels(invalid, true), TOUCHLINE_CARD_MATCH_FACT_CATALOGUES["en-GB"]);
  }
});

test("real verified fact builder localizes only labels while preserving null, zero, values and order", () => {
  const statistics = Object.freeze({ goals: 0, assists: 1, saves: 7, penaltySaves: 0, defense: 2, rating: null, ownGoals: 0, providerUnknown: 900, touchlinePoints: 999 });
  const input = Object.freeze({ position: "GK", statistics });
  const before = JSON.stringify(input);
  const english = buildTouchlineVerifiedMatchFactFields(input, "en-GB");
  assert.deepEqual(english.map(({ value, icon, kind }) => ({ value, icon, kind })), [
    { value: "0", icon: "goal", kind: "stat" },
    { value: "1", icon: "assist", kind: "stat" },
    { value: "7", icon: "saves", kind: "stat" },
    { value: "0", icon: "saves", kind: "stat" },
    { value: "0", icon: "own-goal", kind: "stat" },
    { value: "—", icon: "rating", kind: "stat" },
  ]);
  for (const locale of locales) {
    const fields = buildTouchlineVerifiedMatchFactFields(input, locale, true);
    const labels = TOUCHLINE_CARD_MATCH_FACT_CATALOGUES[locale];
    assert.deepEqual(fields.map(field => field.label), [labels.goals, labels.assists, labels.saves, labels.penaltySaves, labels.ownGoals, labels.rating]);
    assert.deepEqual(fields.map(({ label: _label, ...fact }) => fact), english.map(({ label: _label, ...fact }) => fact));
    const defaultFields = buildTouchlineVerifiedMatchFactFields(input, locale);
    assert.deepEqual(defaultFields, buildTouchlineVerifiedMatchFactFields(input, locale === "pt-BR" ? "pt-BR" : "en-GB", true));
    assert.deepEqual(buildTouchlineVerifiedMatchFactFields({ position: "GK", statistics: null }, locale, true), []);
    assert.deepEqual(buildTouchlineVerifiedMatchFactFields({ position: "GK", statistics: {} }, locale, true), []);
    const unknown = buildTouchlineVerifiedMatchFactFields({ position: "unverified-role", statistics }, locale, true);
    assert.deepEqual(unknown.map(field => field.label), [labels.goals, labels.assists, labels.ownGoals, labels.rating]);
  }
  assert.equal(JSON.stringify(input), before);
});
