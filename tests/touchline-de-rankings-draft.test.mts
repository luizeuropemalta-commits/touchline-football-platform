import assert from "node:assert/strict";
import test from "node:test";
import { isTouchLineLocaleComplete } from "../lib/touchlineArena/i18n.ts";
import {
  TOUCHLINE_RANKINGS_DRAFT_STATE,
  touchlineRankingsDrafts,
} from "../lib/touchlineArena/locale-catalogues/rankings-drafts.ts";

test("de-DE rankings draft has non-empty German copy without opening the locale gate", () => {
  const copy = touchlineRankingsDrafts["de-DE"];

  assert.equal(TOUCHLINE_RANKINGS_DRAFT_STATE, "draft");
  assert.equal(isTouchLineLocaleComplete("de-DE"), false);
  for (const [key, value] of Object.entries(copy)) {
    assert.ok(value.trim(), `${key}: empty`);
    assert.doesNotMatch(value, /\bTODO\b|\bFIXME\b|\[(?:translate|missing)\]/i, key);
  }
});

test("de-DE rankings draft preserves the protected competition names exactly", () => {
  const copy = touchlineRankingsDrafts["de-DE"];

  assert.equal(copy.touchLineXi, "TouchLine XI");
  assert.equal(copy.clubOwners, "ClubOwners");
  assert.equal(copy.ownerLeagueTable, "ClubOwner Table");
  assert.equal(copy.marketTransfer, "ClubOwner");
  assert.match(copy.ownerLeagueRule, /TouchLine Cards League/);
  assert.match(copy.connectedDescription, /ClubOwner, ClubHub/);
  assert.doesNotMatch(copy.connectedDescription, /Market Transfer/);
  assert.match(copy.connectedDescription, /ClubOwner/);
});

test("de-DE rankings draft uses German labels while preserving ranking facts", () => {
  const copy = touchlineRankingsDrafts["de-DE"];

  assert.deepEqual({
    heading: copy.rankingTitle,
    mode: copy.rankMode,
    cards: copy.rankedCards,
    position: copy.playerRank,
    rule: copy.seasonSelectionRule,
  }, {
    heading: "Spielerkarten-Rangliste",
    mode: "Ranglistenmodus",
    cards: "Karten in der aktuellen Rangliste",
    position: "Platz",
    rule: "11 vorläufige Spitzenreiter nach Position, basierend auf den über die Saison gesammelten TouchLine-Bewertungen der aktuellen geprüften Veröffentlichung.",
  });
  assert.match(copy.seasonSelectionRule, /\b11\b/);
});
