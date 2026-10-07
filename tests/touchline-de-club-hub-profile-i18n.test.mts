import assert from "node:assert/strict";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES,
  TOUCHLINE_CLUB_HUB_PROFILE_DRAFT_STATUS,
} from "../lib/touchlineArena/club-hub-profile-i18n.ts";

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1]).sort();

test("de-DE Club Hub profile copy is complete without opening the locale gate", () => {
  const copy = TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES["de-DE"];
  const english = TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES["en-GB"];

  assert.equal(TOUCHLINE_CLUB_HUB_PROFILE_DRAFT_STATUS, "draft");
  assert.equal(isTouchLineLocaleComplete("de-DE"), false);
  for (const [key, value] of Object.entries(copy)) {
    assert.ok(value.trim(), `${key}: empty`);
    assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b|\[(?:translate|missing)\]/i, key);
    assert.deepEqual(placeholders(value), placeholders(english[key]), key);
  }
});

test("de-DE Club Hub profile keeps German labels and identity placeholders", () => {
  const copy = TOUCHLINE_CLUB_HUB_PROFILE_CATALOGUES["de-DE"];

  assert.deepEqual({
    centreBack: copy.topCentreBack,
    table: copy.nextAndTable,
    fixture: copy.nextFixture,
    stadium: copy.stadiumAria,
    crest: copy.clubLogo,
    lineUp: copy.lineupCoachBench,
    finished: copy.finished,
  }, {
    centreBack: "Bester Innenverteidiger",
    table: "Nächstes Spiel und offizielle Tabelle",
    fixture: "Nächste Begegnung",
    stadium: "Vereinsstadion: {name}",
    crest: "Wappen von {name}",
    lineUp: "Aufstellung, Trainer und Ersatzbank",
    finished: "Beendet",
  });
});
