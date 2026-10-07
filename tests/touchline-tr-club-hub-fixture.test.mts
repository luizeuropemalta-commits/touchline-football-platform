import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_COMPLETE_LOCALES, isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES,
  TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_STATUS,
  getTouchlineClubHubFixtureCopy,
} from "../lib/touchlineArena/club-hub-fixture-i18n.ts";

function placeholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();
}

test("tr-TR ClubHub fixture copy is complete, Turkish, and preserves factual placeholders", () => {
  const source = TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES["en-GB"];
  const copy = TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES["tr-TR"];

  assert.deepEqual(Object.keys(copy), Object.keys(source));
  for (const key of Object.keys(source) as (keyof typeof source)[]) {
    assert.ok(copy[key].trim(), `${key}: empty translation`);
    assert.deepEqual(placeholders(copy[key]), placeholders(source[key]), `${key}: placeholder contract`);
    if (source[key].length > 40) assert.notEqual(copy[key], source[key], `${key}: accidental English fallback`);
  }
  assert.deepEqual(
    [copy.nextMatch, copy.matchUpdate, copy.localTime, copy.verifiedScore, copy.stadium, copy.venuePending, copy.previewLink, copy.crestAlt],
    ["SONRAKİ MAÇ", "MAÇ GÜNCELLEMESİ", "Yerel saatiniz", "Doğrulanmış skor", "STADYUM", "Stadyum doğrulanıyor", "Sonraki maç gönderisinin ön izlemesini gör", "{name} arması"],
  );
});

test("tr-TR ClubHub fixture copy remains behind the EN/PT public gate", () => {
  assert.equal(TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_STATUS, "draft");
  assert.deepEqual([...TOUCHLINE_COMPLETE_LOCALES], ["en-GB", "pt-BR"]);
  assert.equal(isTouchLineLocaleComplete("tr-TR"), false);
  assert.equal(getTouchlineClubHubFixtureCopy("tr-TR").nextMatch, "NEXT MATCH");
});
