import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES,
  TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_STATUS,
  getTouchlineClubHubLineupCopy,
} from "../lib/touchlineArena/club-hub-lineup-i18n.ts";

test("tr-TR ClubHub line-up copy is complete, Turkish, and preserves roster semantics", () => {
  const source = TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES["en-GB"];
  const copy = TOUCHLINE_CLUB_HUB_LINEUP_CATALOGUES["tr-TR"];

  assert.deepEqual(Object.keys(copy), Object.keys(source));
  for (const key of Object.keys(source) as (keyof typeof source)[]) {
    assert.ok(copy[key].trim(), `${key}: empty translation`);
    if (source[key].length > 40) assert.notEqual(copy[key], source[key], `${key}: accidental English fallback`);
  }
  assert.deepEqual(
    [copy.confirmedTitle, copy.previewTitle, copy.unconfirmedTitle, copy.matchdayEyebrow, copy.matchupAria, copy.matchupEyebrow, copy.awaitingConfirmation, copy.pitchAriaSuffix, copy.positionLeadersAria],
    ["İlk 11 onaylandı", "Kadro ön izlemesi", "İlk 11 henüz onaylanmadı", "Maç kadrosu", "Maç eşleşmesi", "EŞLEŞME", "Onay bekleniyor", "kadro sahası", "Pozisyona göre kulüp liderleri"],
  );
  assert.match(copy.previewNotice, /TouchLine/);
  assert.match(copy.illustrativeNotice, /ilk 11 tahmini değildir/);
  assert.match(copy.emptyLineup, /TouchLine/);
});

test("tr-TR ClubHub line-up copy remains an unpublished draft", () => {
  assert.equal(TOUCHLINE_CLUB_HUB_LINEUP_DRAFT_STATUS, "draft");
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
  assert.equal(isTouchLineLocaleComplete("tr-TR"), false);
  assert.equal(getTouchlineClubHubLineupCopy("tr-TR").confirmedTitle, "Line-up confirmed");
});
