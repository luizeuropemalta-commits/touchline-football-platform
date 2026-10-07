import assert from "node:assert/strict";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES,
  TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_STATUS,
} from "../lib/touchlineArena/club-hub-fixture-i18n.ts";

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1]).sort();

test("de-DE Club Hub fixture copy is complete without opening the locale gate", () => {
  const copy = TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES["de-DE"];
  const english = TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES["en-GB"];

  assert.equal(TOUCHLINE_CLUB_HUB_FIXTURE_DRAFT_STATUS, "draft");
  assert.equal(isTouchLineLocaleComplete("de-DE"), false);
  for (const [key, value] of Object.entries(copy)) {
    assert.ok(value.trim(), `${key}: empty`);
    assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b|\[(?:translate|missing)\]/i, key);
    assert.deepEqual(placeholders(value), placeholders(english[key]), key);
  }
});

test("de-DE Club Hub fixture labels preserve verified-state and supplied-name contracts", () => {
  const copy = TOUCHLINE_CLUB_HUB_FIXTURE_CATALOGUES["de-DE"];

  assert.deepEqual(copy, {
    nextMatch: "NÄCHSTES SPIEL",
    matchUpdate: "SPIELAKTUALISIERUNG",
    localTime: "Deine Ortszeit",
    verifiedScore: "Bestätigter Spielstand",
    stadium: "STADION",
    venuePending: "Stadion wird überprüft",
    previewLink: "Beitragsvorschau für das nächste Spiel ansehen",
    crestAlt: "Wappen von {name}",
  });
});
