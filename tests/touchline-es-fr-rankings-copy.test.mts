import assert from "node:assert/strict";
import test from "node:test";
import { touchlineRankingsDrafts } from "../lib/touchlineArena/locale-catalogues/rankings-drafts.ts";
import { getTouchlineNotificationCopy } from "../lib/touchlineArena/notification-i18n.ts";

test("Spanish rankings use cartas consistently and French tables description reads naturally", () => {
  const spanish = touchlineRankingsDrafts["es-ES"];
  const french = touchlineRankingsDrafts["fr-FR"];

  for (const key of [
    "publishedRankingDescription",
    "playerRankingSummary",
    "topPlayerCards",
    "fullPlayerRanking",
    "officialTopTwenty",
    "publishedCards",
    "rankedCards",
    "cardsTracked",
    "cardsTrackedDescription",
    "cards",
    "rankingTitle",
    "rankingDescription",
    "allOwnedCards",
  ] as const) {
    assert.match(spanish[key], /cartas/i, key);
    assert.doesNotMatch(spanish[key], /tarjetas/i, key);
  }
  assert.match(spanish.seasonSelectionHint, /una carta para ampliarla/);
  assert.doesNotMatch(spanish.seasonSelectionHint, /tarjeta/i);
  assert.match(spanish.rankingDescription, /de la carta define su marco aprobado/);
  // Football disciplinary cards retain their distinct Spanish terminology.
  const disciplinaryCopy = getTouchlineNotificationCopy("es-ES");
  assert.ok(disciplinaryCopy);
  assert.equal(disciplinaryCopy.eventLabels["red-card"], "Tarjeta roja");
  assert.equal(
    french.tablesDescription,
    "L’espace compétitif du meilleur onze par poste, des entraîneurs les mieux classés et de la ClubOwner Table. Tous les classements proviennent des sources officielles de la compétition TouchLine.",
  );

  assert.equal(touchlineRankingsDrafts["it-IT"].clubOwners, "ClubOwner");
  assert.equal(touchlineRankingsDrafts["it-IT"].clubHub, "ClubHub");
});
