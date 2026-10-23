import assert from "node:assert/strict";
import test from "node:test";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import { projectTouchlinePublishedRankingCatalog } from "../lib/touchlineArena/published-ranking-catalog.ts";
import { resolveTouchlineRankingZoomSelection, touchlineRankingZoomSelectionForCard } from "../lib/touchlineArena/touchline-ranking-zoom-selection.ts";

const playerId = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const providerId = (index: number) => String(1000 + index);

function card(index: number): ClubOwnerSquadCard {
  return {
    id: playerId(index), canonicalPlayerId: playerId(index), providerPlayerId: providerId(index),
    name: `Player ${index}`, shortName: `P${index}`, clubName: "Arsenal FC", role: "ST", position: "Striker",
    shirtNumber: index, countryCode3: "ENG", marketValue: "€1m", touchlinePoints: 999,
    seasonTotalRating: 888, matchRating: 7.2, matchStats: { goals: 1 }, seasonStats: { goals: 5 },
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" },
    publishedRanking: { snapshotId: "old", providerPlayerId: providerId(index), totalRating: 888, minutesPlayed: 10, appearances: 1 },
  };
}

function ranking(snapshotId = "A", totals: Array<number | null> = Array.from({ length: 25 }, (_, index) => 100 - index)): TouchlineActiveRankingState {
  return {
    ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked", snapshotId, seasonId: "season-2026", roundId: "8",
    scoringVersion: "player_scoring_v4", coverageStatus: "complete_for_scoring", publishedAt: "2026-10-23T10:00:00Z",
    players: totals.map((totalRating, index) => ({
      playerId: playerId(index), providerPlayerId: providerId(index), totalRating,
      minutesPlayed: 90, appearances: 1, positionGroup: "striker", positionRank: index + 1,
      groupSize: totals.length, tierKey: "diamond-gold", priceTc: 999999,
    })),
  };
}

const selection = { playerId: playerId(0), providerPlayerId: providerId(0) };
function selectedCard(catalogue: readonly ClubOwnerSquadCard[], publication: TouchlineActiveRankingState | null) {
  const result = resolveTouchlineRankingZoomSelection(catalogue, publication, selection);
  assert.equal(result.phase, "available");
  if (result.phase !== "available") throw new Error("Expected selected public card");
  return result.card;
}

test("selection contains UUID and provider only; unresolved identities cannot borrow a name or provider", () => {
  assert.deepEqual(touchlineRankingZoomSelectionForCard({ ...card(0), canonicalPlayerId: playerId(0).toUpperCase(), seasonTotalRating: 45 }), selection);
  assert.deepEqual(touchlineRankingZoomSelectionForCard({ ...card(0), canonicalPlayerId: undefined }), selection);
  for (const candidate of [
    { ...card(0), canonicalPlayerId: "Player 0" },
    { ...card(0), canonicalPlayerId: undefined, id: providerId(0) },
    { ...card(0), providerPlayerId: "" },
  ]) assert.equal(touchlineRankingZoomSelectionForCard(candidate), null);
  assert.equal(resolveTouchlineRankingZoomSelection([card(0)], ranking("A", [45]), { ...selection, playerId: "Player 0" }).phase, "unavailable");
});

test("selected score follows A -> rank4 -> rank21 -> A independently of top-N membership", () => {
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const a = ranking();
  const b = ranking("B", [96.5, ...a.players.slice(1).map(row => row.totalRating)]);
  const c = ranking("C", [79.5, ...a.players.slice(1).map(row => row.totalRating)]);
  for (const [publication, expectedIndex, score] of [[a, 0, 100], [b, 3, 96.5], [c, 20, 79.5], [a, 0, 100]] as const) {
    const projected = projectTouchlinePublishedRankingCatalog(catalogue, publication);
    assert.equal(projected.phase, "ready");
    assert.equal(projected.cards.findIndex(value => value.canonicalPlayerId === selection.playerId), expectedIndex);
    const selected = selectedCard(catalogue, publication);
    assert.equal(selected.seasonTotalRating, score);
    assert.equal(selected.publishedRanking?.snapshotId, publication.snapshotId);
  }
});

test("an unrelated missing published card withholds the list, not the selected player's current facts", () => {
  const catalogue = [card(0)];
  const next = ranking("B", [45, 99]);
  assert.equal(projectTouchlinePublishedRankingCatalog(catalogue, next).phase, "incomplete");
  assert.equal(selectedCard(catalogue, next).seasonTotalRating, 45);
  assert.equal(selectedCard([...catalogue, card(1)], next).seasonTotalRating, 45);
  assert.equal(selectedCard([...catalogue, { ...card(1), editorialCard: null }], next).seasonTotalRating, 45);
});

test("null, absence and withdrawal clear the score; zero remains zero and old catalogue scores never return", () => {
  const catalogue = [card(0)];
  assert.equal(selectedCard(catalogue, ranking("zero", [0])).seasonTotalRating, 0);
  assert.equal(selectedCard(catalogue, ranking("null", [null])).seasonTotalRating, null);
  const absent = ranking("absent", [9, 10]);
  absent.players = absent.players.slice(1);
  for (const publication of [null, TOUCHLINE_PRESEASON_RANKING_STATE, absent]) {
    const selected = selectedCard(catalogue, publication);
    assert.equal(selected.seasonTotalRating, null);
    assert.equal(selected.publishedRanking, undefined);
    assert.equal(selected.matchRating, 7.2, "historical facts remain explicitly separate from season score");
  }
  assert.equal(selectedCard(catalogue, ranking("A", [45])).seasonTotalRating, 45);
});

test("selected catalogue/provider conflicts and editorial removal hide the card, including on withdrawal", () => {
  const original = card(0);
  const cases: readonly ClubOwnerSquadCard[][] = [
    [], [original, { ...original }], [original, { ...card(1), providerPlayerId: providerId(0) }],
    [{ ...original, providerPlayerId: providerId(1) }],
    [{ ...original, canonicalPlayerId: playerId(1) }],
    [{ ...original, editorialCard: null }],
    [{ ...original, editorialCard: { ...original.editorialCard!, lastReviewedAt: "not-a-date" } }],
  ];
  for (const catalogue of cases) {
    for (const publication of [ranking("A", [45]), null]) {
      const result = resolveTouchlineRankingZoomSelection(catalogue, publication, selection);
      assert.equal(result.phase, "unavailable");
      assert.equal("card" in result, false, "never retain a stale selected card as fallback");
    }
  }
});

test("selected ranking collisions and mismatches never leak another player's score", () => {
  const a = ranking("A", [45, 40]);
  for (const players of [
    [a.players[0], { ...a.players[1], playerId: playerId(0) }],
    [a.players[0], { ...a.players[1], providerPlayerId: providerId(0) }],
    [{ ...a.players[0], providerPlayerId: providerId(1) }],
    [{ ...a.players[0], playerId: playerId(1) }],
  ]) assert.equal(resolveTouchlineRankingZoomSelection([card(0)], { ...a, players }, selection).phase, "unavailable");
  assert.equal(selectedCard([card(0)], { ...a, players: [{ ...a.players[0], providerPlayerId: Number(providerId(0)) }] }).seasonTotalRating, 45);
});

test("invalid publication scope, metadata and selected numeric facts fail closed", () => {
  const a = ranking("A", [45]);
  const invalid: TouchlineActiveRankingState[] = [
    { ...a, leagueKey: "another-league" }, { ...a, scoringVersion: "player_scoring_v3" },
    { ...a, snapshotId: null }, { ...a, seasonId: null }, { ...a, coverageStatus: null },
    { ...a, players: [{ ...a.players[0], totalRating: Number.NaN }] },
    { ...a, players: [{ ...a.players[0], totalRating: Number.POSITIVE_INFINITY }] },
    { ...a, players: [{ ...a.players[0], minutesPlayed: -1 }] },
    { ...a, players: [{ ...a.players[0], appearances: Number.NaN }] },
  ];
  for (const publication of invalid) assert.deepEqual(resolveTouchlineRankingZoomSelection([card(0)], publication, selection), { phase: "unavailable", reason: "publication" });
});

test("fresh catalogue data is used and only display score/evidence is projected; economy and match history are unchanged", () => {
  const original = card(0);
  const catalogue = [original];
  const a = ranking("A", [45]);
  const before = JSON.stringify({ catalogue, a });
  const selected = selectedCard(catalogue, a);
  assert.notEqual(selected, original);
  assert.equal(selected.editorialCard, original.editorialCard);
  assert.equal(selected.matchStats, original.matchStats);
  assert.equal(selected.seasonStats, original.seasonStats);
  assert.deepEqual({ ...selected, seasonTotalRating: original.seasonTotalRating, publishedRanking: original.publishedRanking }, original);
  assert.equal(JSON.stringify({ catalogue, a }), before);
  const refreshed = { ...original, name: "Verified new name", matchRating: 8 };
  const next = selectedCard([refreshed], ranking("B", [50]));
  assert.equal(next.name, refreshed.name);
  assert.equal(next.matchRating, 8);
  assert.equal(next.seasonTotalRating, 50);
  assert.equal(next.editorialCard?.tierKey, "ruby-red");
  assert.equal(next.editorialCard?.cardPrice.amountMinor, 1500);
  assert.equal(next.touchlinePoints, 999, "fantasy/economy is not ranking authority");
});
