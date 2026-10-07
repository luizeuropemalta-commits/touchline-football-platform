import assert from "node:assert/strict";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES,
  TOUCHLINE_CLUB_HUB_ROSTER_DRAFT_STATUS,
} from "../lib/touchlineArena/club-hub-roster-i18n.ts";

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
  .map((match) => match[1]).sort();

test("de-DE Club Hub roster labels are complete without opening the locale gate", () => {
  const copy = TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES["de-DE"];

  assert.equal(TOUCHLINE_CLUB_HUB_ROSTER_DRAFT_STATUS, "draft");
  assert.equal(isTouchLineLocaleComplete("de-DE"), false);
  for (const [key, value] of Object.entries(copy)) {
    assert.ok(value.trim(), `${key}: empty`);
    assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b|\[(?:translate|missing)\]/i, key);
    assert.deepEqual(placeholders(value), placeholders(TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES["en-GB"][key]), key);
  }
});

test("de-DE Club Hub roster preserves technical labels and supplied placeholders", () => {
  const copy = TOUCHLINE_CLUB_HUB_ROSTER_CATALOGUES["de-DE"];

  assert.deepEqual({
    bench: copy.bench,
    confirmed: copy.confirmed,
    shown: copy.shown,
    loadMore: copy.loadMore,
    technical: copy.technicalAria,
    card: copy.openPlayerCard,
  }, {
    bench: "Ersatzbank",
    confirmed: "Spielbericht bestätigt",
    shown: "Angezeigte Spieler: {shown} von {total}",
    loadMore: "{count} weitere anzeigen",
    technical: "Technische Zone von {clubName} am Spieltag",
    card: "Spielerkarte öffnen",
  });
  assert.match(copy.preview, /TouchLine/);
});
