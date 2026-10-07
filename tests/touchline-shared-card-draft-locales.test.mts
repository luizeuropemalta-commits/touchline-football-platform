import assert from "node:assert/strict";
import test from "node:test";
import { getTouchlineExactCardCopy, TOUCHLINE_EXACT_CARD_DRAFT_STATUS } from "../lib/touchlineArena/exact-card-i18n.ts";
import { getTouchlineCoachCardCopy, TOUCHLINE_COACH_CARD_DRAFT_STATUS } from "../lib/touchlineArena/coach-card-i18n.ts";
import { isTouchLineLocaleComplete, normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const expected = [
  ["en-GB", "Current Club", "Current club"],
  ["pt-BR", "Clube atual", "Clube atual"],
  ["es-ES", "Club actual", "Club actual"],
  ["it-IT", "Club attuale", "Club attuale"],
  ["fr-FR", "Club actuel", "Club actuel"],
  ["ar-SA", "النادي الحالي", "النادي الحالي"],
  ["tr-TR", "Mevcut kulüp", "Mevcut kulüp"],
  ["de-DE", "Aktueller Verein", "Aktueller Verein"],
] as const;

test("the two reusable card catalogues render all eight languages only with explicit opt-in", () => {
  for (const [locale, playerClub, coachClub] of expected) {
    assert.equal(getTouchlineExactCardCopy(locale, true).currentClub, playerClub);
    assert.equal(getTouchlineCoachCardCopy(locale, true).currentClub, coachClub);
    if (locale === "en-GB" || locale === "pt-BR") continue;
    assert.equal(getTouchlineExactCardCopy(locale).currentClub, "Current Club");
    assert.equal(getTouchlineCoachCardCopy(locale).currentClub, "Current club");
    assert.equal(normalizeTouchLineLocale(locale), "en-GB");
    assert.equal(isTouchLineLocaleComplete(locale), false);
  }
  assert.equal(TOUCHLINE_EXACT_CARD_DRAFT_STATUS, "draft");
  assert.equal(TOUCHLINE_COACH_CARD_DRAFT_STATUS, "draft");
});

test("invalid and missing card locales keep a deterministic English fallback", () => {
  for (const locale of [undefined, null, "", "ar", "AR-SA", "not-a-locale"]) {
    assert.equal(getTouchlineExactCardCopy(locale, true).currentClub, "Current Club");
    assert.equal(getTouchlineCoachCardCopy(locale, true).currentClub, "Current club");
  }
});

test("translated card messages preserve literal factual names and rating placeholders", () => {
  for (const [locale] of expected) {
    const player = getTouchlineExactCardCopy(locale, true);
    const coach = getTouchlineCoachCardCopy(locale, true);
    assert.ok(player.cardAria.includes("{playerName}"));
    assert.ok(player.ratingAria.includes("{rating}"));
    assert.ok(coach.coachCardAria.includes("{coachName}"));
    assert.ok(player.cardAria.replace("{playerName}", () => "Player $& <name>").includes("Player $& <name>"));
    assert.ok(coach.coachCardAria.replace("{coachName}", () => "Coach $& <name>").includes("Coach $& <name>"));
  }
});
