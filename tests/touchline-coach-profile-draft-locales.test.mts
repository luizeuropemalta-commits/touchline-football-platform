import assert from "node:assert/strict";
import test from "node:test";
import { getTouchlineCoachProfileCopy, getTouchlineCoachProfileReason, TOUCHLINE_COACH_PROFILE_DRAFT_STATUS } from "../lib/touchlineArena/coach-profile-i18n.ts";
import { getTouchlineCoachPerformanceCopy, TOUCHLINE_COACH_PERFORMANCE_DRAFT_STATUS } from "../lib/touchlineArena/coach-performance-i18n.ts";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";

const expected = [
  ["en-GB", "Home", "Season", "Matches"],
  ["pt-BR", "Casa", "Temporada", "Partidas"],
  ["es-ES", "Local", "Temporada", "Partidos"],
  ["it-IT", "Casa", "Stagione", "Partite"],
  ["fr-FR", "Domicile", "Saison", "Matchs"],
  ["ar-SA", "على أرضه", "الموسم", "المباريات"],
  ["tr-TR", "İç saha", "Sezon", "Maçlar"],
  ["de-DE", "Heim", "Saison", "Spiele"],
] as const;

test("coach profile opt-in composes all eight languages without a nested English fallback", () => {
  for (const [locale, home, season, matches] of expected) {
    const copy = getTouchlineCoachPerformanceCopy(locale, true);
    assert.equal(copy.home, home);
    assert.equal(copy.season, season);
    assert.equal(copy.matches, matches);
    assert.equal(copy.matches, getTouchlineCoachProfileCopy(locale, true).matches);
    if (locale === "en-GB" || locale === "pt-BR") {
      assert.deepEqual(copy, getTouchlineCoachPerformanceCopy(locale));
    } else {
      assert.deepEqual(getTouchlineCoachPerformanceCopy(locale), getTouchlineCoachPerformanceCopy("en-GB"));
      assert.deepEqual(getTouchlineCoachProfileCopy(locale), getTouchlineCoachProfileCopy("en-GB"));
      assert.equal(isTouchLineLocaleComplete(locale), false);
    }
  }
  assert.equal(TOUCHLINE_COACH_PROFILE_DRAFT_STATUS, "draft");
  assert.equal(TOUCHLINE_COACH_PERFORMANCE_DRAFT_STATUS, "draft");
});

test("classification reason opt-in translates explanations without replacing unknown values with fabricated facts", () => {
  for (const [locale] of expected) {
    const copy = getTouchlineCoachProfileCopy(locale, true);
    assert.equal(getTouchlineCoachProfileReason("promoted", locale, true), copy.reasonPromoted);
    assert.equal(getTouchlineCoachProfileReason("classification-pending", locale, true), copy.reasonHistoryPending);
    assert.equal(getTouchlineCoachProfileReason("__proto__", locale, true), copy.reasonFallback);
    assert.equal(getTouchlineCoachProfileReason("unknown", locale, true), copy.reasonFallback);
    assert.ok(copy.classificationDescription.includes("{reason}"));
    assert.ok(getTouchlineCoachPerformanceCopy(locale, true).rank.includes("{rank}"));
  }
});

test("unsupported coach locale remains English even with explicit opt-in", () => {
  for (const locale of [null, undefined, "", "constructor", "ar", "AR-SA"]) {
    assert.deepEqual(getTouchlineCoachPerformanceCopy(locale, true), getTouchlineCoachPerformanceCopy("en-GB"));
    assert.deepEqual(getTouchlineCoachProfileCopy(locale, true), getTouchlineCoachProfileCopy("en-GB"));
  }
});
