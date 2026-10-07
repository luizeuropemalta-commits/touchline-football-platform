import assert from "node:assert/strict";
import test from "node:test";
import { formatTouchlinePlayerSocialAria, formatTouchlinePlayerSocialCount, getTouchlinePlayerSocialCopy } from "../lib/touchlineArena/player-social-i18n.ts";

const expected = [
  ["en-GB", "Follow"], ["pt-BR", "Seguir"], ["es-ES", "Seguir"], ["it-IT", "Segui"],
  ["fr-FR", "Suivre"], ["ar-SA", "متابعة"], ["tr-TR", "Takip et"], ["de-DE", "Folgen"],
] as const;

test("social copy opt-in retains each authored language while default callers stay gated", () => {
  for (const [locale, follow] of expected) {
    assert.equal(getTouchlinePlayerSocialCopy(locale, true).follow, follow);
    if (locale === "pt-BR" || locale === "en-GB") {
      assert.deepEqual(getTouchlinePlayerSocialCopy(locale, true), getTouchlinePlayerSocialCopy(locale));
    } else {
      assert.equal(getTouchlinePlayerSocialCopy(locale).follow, "Follow");
    }
    assert.ok(formatTouchlinePlayerSocialAria("Player $& <name>", locale, true).includes("Player $& <name>"));
  }
  assert.equal(formatTouchlinePlayerSocialAria("Ada", "fr-FR", true), "Interactions avec Ada");
  assert.equal(formatTouchlinePlayerSocialAria("Ada", "fr-FR"), "Interactions with Ada");
});

test("social counts use the chosen locale only under opt-in, preserving missing and zero", () => {
  for (const [locale] of expected) {
    assert.equal(formatTouchlinePlayerSocialCount(undefined, locale, true), "—");
    assert.equal(formatTouchlinePlayerSocialCount(0, locale, true), new Intl.NumberFormat(locale).format(0));
    assert.equal(formatTouchlinePlayerSocialCount(1250, locale, true), new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(1250));
  }
  assert.equal(formatTouchlinePlayerSocialCount(1250, "fr-FR"), "1.3k");
});

test("social opt-in rejects unsupported locale keys", () => {
  for (const locale of [undefined, null, "", "__proto__", "AR-SA", "ar"]) {
    assert.equal(getTouchlinePlayerSocialCopy(locale, true).follow, "Follow");
    assert.equal(formatTouchlinePlayerSocialCount(1250, locale, true), "1.3k");
  }
});
