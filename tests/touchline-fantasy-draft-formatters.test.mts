import assert from "node:assert/strict";
import test from "node:test";
import { formatTouchlineFantasyDeadline, formatTouchlineFantasyMarketValue } from "../lib/touchlineFantasy/domain.ts";
import { normalizeTouchLineLocale } from "../lib/touchlineArena/i18n.ts";

const drafts = ["es-ES", "it-IT", "fr-FR", "ar-SA", "tr-TR", "de-DE"] as const;
const summer = "2026-07-03T12:30:00Z";
const winter = "2026-01-03T12:30:00Z";

test("formatters keep public EN/PT behavior and require per-call draft opt-in", () => {
  for (const locale of ["en-GB", "pt-BR"]) {
    assert.equal(formatTouchlineFantasyDeadline(summer, locale, true), formatTouchlineFantasyDeadline(summer, locale));
    assert.equal(formatTouchlineFantasyMarketValue(1_500_000, locale, true), formatTouchlineFantasyMarketValue(1_500_000, locale));
  }
  for (const locale of drafts) {
    assert.equal(formatTouchlineFantasyDeadline(summer, locale), formatTouchlineFantasyDeadline(summer, "en-GB"));
    assert.equal(formatTouchlineFantasyMarketValue(1_500_000, locale), formatTouchlineFantasyMarketValue(1_500_000, "en-GB"));
    formatTouchlineFantasyDeadline(summer, locale, true);
    formatTouchlineFantasyMarketValue(1_500_000, locale, true);
    assert.equal(normalizeTouchLineLocale(locale), "en-GB", "presentation opt-in does not release the locale globally");
  }
  for (const locale of ["", "unknown", "__proto__", "constructor"]) {
    assert.equal(formatTouchlineFantasyDeadline(summer, locale, true), formatTouchlineFantasyDeadline(summer, "en-GB"));
    assert.equal(formatTouchlineFantasyMarketValue(1_500_000, locale, true), formatTouchlineFantasyMarketValue(1_500_000, "en-GB"));
  }
});

test("draft deadlines retain London DST and Gregorian calendar while translating the date", () => {
  for (const locale of drafts.filter(locale => locale !== "ar-SA")) {
    assert.match(formatTouchlineFantasyDeadline(summer, locale, true), /2026, 13:30$/);
    assert.match(formatTouchlineFantasyDeadline(winter, locale, true), /2026, 12:30$/);
    assert.equal(formatTouchlineFantasyDeadline("invalid", locale, true), "—");
  }
  assert.match(formatTouchlineFantasyDeadline(summer, "fr-FR", true), /juil/);
  const arabic = formatTouchlineFantasyDeadline(summer, "ar-SA", true);
  assert.match(arabic, /٢٠٢٦/);
  assert.match(arabic, /١٣:٣٠$/);
  assert.notEqual(arabic, formatTouchlineFantasyDeadline(summer, "ar-SA"));
});

test("draft amounts change notation only, retaining EUR and the original amount", () => {
  assert.match(formatTouchlineFantasyMarketValue(1_500_000, "fr-FR", true), /1,5\s*M\s*€/);
  assert.match(formatTouchlineFantasyMarketValue(1_500_000, "de-DE", true), /1,5\s*Mio\.\s*€/);
  for (const locale of drafts) {
    const zero = formatTouchlineFantasyMarketValue(0, locale, true);
    assert.match(zero, /[0٠]/);
    assert.doesNotMatch(zero, /NaN|undefined/);
    assert.notEqual(formatTouchlineFantasyMarketValue(1_500_000, locale, true), zero);
  }
});
