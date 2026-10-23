import assert from "node:assert/strict";
import test from "node:test";
import { projectTouchlinePublishedRankingCatalog } from "../lib/touchlineArena/published-ranking-catalog.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const playerId = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const providerId = (index: number) => String(1000 + index);

function card(index: number): ClubOwnerSquadCard {
  return {
    id: playerId(index), canonicalPlayerId: playerId(index), providerPlayerId: providerId(index),
    name: `Player ${index}`, shortName: `P${index}`, clubName: `Club ${index}`,
    role: "ST", position: "Striker", shirtNumber: index, countryCode3: "ENG", marketValue: "€1m",
    cardTier: "ruby-red", cardPriceAuthority: "active-contract", inventoryId: `inventory-${index}`,
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" },
    touchlinePoints: 999, seasonTouchlinePoints: 888, seasonTotalRating: 100 - index,
    publishedRanking: { snapshotId: "old", providerPlayerId: providerId(index), totalRating: 100 - index, minutesPlayed: 999, appearances: 99 },
    matchRating: 7, matchTouchlinePoints: 99, matchStats: { goals: 1 }, seasonStats: { goals: 5, minutes: 9999 },
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

function ready(catalogue: readonly ClubOwnerSquadCard[], publication: TouchlineActiveRankingState) {
  const result = projectTouchlinePublishedRankingCatalog(catalogue, publication);
  assert.equal(result.phase, "ready");
  if (result.phase !== "ready") throw new Error("Expected complete projection");
  return result;
}

test("complete catalogue permits A -> new leader outside top20 -> A without stale order or mutated history", () => {
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const before = JSON.stringify(catalogue);
  const a = ranking();
  const b = ranking("B");
  b.players = b.players.map((row, index) => index === 20 ? { ...row, totalRating: 120, minutesPlayed: 180, appearances: 2 } : row);
  b.publishedAt = "2026-10-23T11:00:00Z";
  const projectedA = ready(catalogue, a);
  assert.equal(projectedA.cards[0].canonicalPlayerId, playerId(0));
  assert.ok(!projectedA.cards.slice(0, 20).some(value => value.canonicalPlayerId === playerId(20)));
  const projectedB = ready(catalogue, b);
  assert.equal(projectedB.cards[0].name, "Player 20");
  assert.equal(projectedB.cards[0].seasonTotalRating, 120);
  assert.equal(projectedB.cards[0].publishedRanking?.snapshotId, "B");
  assert.equal(projectedB.cards[0].publishedRanking?.minutesPlayed, 180);
  assert.equal(projectedB.cards[0].publishedRanking?.appearances, 2);
  assert.deepEqual(projectedB.cards.slice(0, 3).map(value => value.canonicalPlayerId), [playerId(20), playerId(0), playerId(1)]);
  assert.equal(projectedB.cards.slice(0, 20).length, 20);
  assert.deepEqual(ready(catalogue, a), projectedA, "reactivated A remains valid despite its older creation timestamp");
  for (const projected of projectedB.cards) {
    const original = catalogue.find(value => value.canonicalPlayerId === projected.canonicalPlayerId)!;
    assert.deepEqual({ ...projected, seasonTotalRating: original.seasonTotalRating, publishedRanking: original.publishedRanking }, original,
      "identity, economics, editorial state and history are unchanged");
    assert.equal(projected.editorialCard, original.editorialCard);
    assert.equal(projected.matchStats, original.matchStats);
    assert.equal(projected.seasonStats, original.seasonStats);
  }
  assert.equal(JSON.stringify(catalogue), before);
});

test("unknown new candidate withholds the entire ranking until its published catalogue card arrives", () => {
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const publication = ranking("C", [...Array.from({ length: 25 }, (_, index) => 100 - index), 200]);
  const result = projectTouchlinePublishedRankingCatalog(catalogue, publication);
  assert.deepEqual(result, { phase: "incomplete", reason: "missing-published-card", missingPlayerIds: [playerId(25)], cards: [] });
  assert.equal(ready([...catalogue, card(25)], publication).cards[0].canonicalPlayerId, playerId(25));
  const unpublished = catalogue.map((value, index) => index === 0 ? { ...value, editorialCard: null } : value);
  assert.deepEqual(projectTouchlinePublishedRankingCatalog(unpublished, ranking()), {
    phase: "incomplete", reason: "missing-published-card", missingPlayerIds: [playerId(0)], cards: [],
  });
});

test("canonical and provider identities must be unique and agree; no name or provider-only borrowing", () => {
  const catalogue = [card(0), card(1)];
  const publication = ranking("A", [10, 9]);
  for (const conflicting of [
    [...catalogue, { ...card(0), canonicalPlayerId: playerId(0).toUpperCase() }],
    [card(0), { ...card(1), providerPlayerId: providerId(0) }],
  ]) {
    const result = projectTouchlinePublishedRankingCatalog(conflicting, publication);
    assert.equal(result.phase, "incomplete");
    if (result.phase === "incomplete") assert.equal(result.reason, "duplicate-catalogue-identity");
  }
  for (const row of [publication.players[0], { ...publication.players[1], providerPlayerId: providerId(0) }]) {
    const result = projectTouchlinePublishedRankingCatalog(catalogue, { ...publication, players: [publication.players[0], row] });
    assert.equal(result.phase, "incomplete");
    if (result.phase === "incomplete") assert.equal(result.reason, "duplicate-ranking-identity");
  }
  const mismatched = projectTouchlinePublishedRankingCatalog([card(0), { ...card(1), providerPlayerId: "different" }], publication);
  assert.equal(mismatched.phase, "incomplete");
  if (mismatched.phase === "incomplete") assert.equal(mismatched.reason, "provider-mismatch");
  for (const invalid of [{ ...card(0), canonicalPlayerId: "Player 0" }, { ...card(0), id: providerId(0), canonicalPlayerId: undefined }]) {
    assert.equal(projectTouchlinePublishedRankingCatalog([invalid, card(1)], publication).phase, "incomplete");
  }
  assert.equal(ready(catalogue, { ...publication, players: publication.players.map(row => ({ ...row, providerPlayerId: Number(row.providerPlayerId) })) }).cards.length, 2);
});

test("null is not zero and goals-only players are outside this total-rating projection", () => {
  const catalogue = [card(0), card(1), card(2)];
  const publication = ranking("null-zero", [null, 0, 3]);
  publication.cardGoals = { source: "published-card-goals-v1", snapshotId: publication.snapshotId!, rows: [{ playerId: playerId(99), goals: 50 }] };
  const projected = ready(catalogue, publication);
  assert.deepEqual(projected.cards.map(value => value.canonicalPlayerId), [playerId(2), playerId(1)]);
  assert.equal(projected.cards[1].seasonTotalRating, 0);
  assert.equal(projected.cards[1].publishedRanking?.totalRating, 0);
  assert.deepEqual(ready([], ranking("no-ratings", [null])).cards, [], "unrated identity is not a candidate or a synthetic zero");
  assert.deepEqual(projectTouchlinePublishedRankingCatalog(catalogue, null), { phase: "withdrawn", cards: [] });
  assert.deepEqual(projectTouchlinePublishedRankingCatalog(catalogue, TOUCHLINE_PRESEASON_RANKING_STATE), { phase: "withdrawn", cards: [] });
  assert.deepEqual(catalogue.map(value => value.seasonTotalRating), [100, 99, 98]);
});

test("new immutable minutes and appearances drive canonical ties instead of old catalogue statistics", () => {
  const catalogue = [card(0), card(1), card(2)];
  const publication = ranking("ties", [10, 10, 10]);
  publication.players = publication.players.map((row, index) => ({ ...row,
    minutesPlayed: index === 0 ? 90 : 180, appearances: index === 2 ? 3 : 2,
  }));
  assert.deepEqual(ready(catalogue, publication).cards.map(value => value.canonicalPlayerId), [playerId(2), playerId(1), playerId(0)]);
  const tied = { ...publication, players: publication.players.map(row => ({ ...row, minutesPlayed: 180, appearances: 3 })) };
  assert.deepEqual(ready([...catalogue].reverse(), tied).cards.map(value => value.canonicalPlayerId), [playerId(0), playerId(1), playerId(2)]);
});

test("wrong version/scope, incomplete coverage and invalid totals fail closed", () => {
  const catalogue = [card(0)];
  const publication = ranking("A", [10]);
  const invalid: TouchlineActiveRankingState[] = [
    { ...publication, scoringVersion: "player_scoring_v3" }, { ...publication, leagueKey: "another-league" },
    { ...publication, coverageStatus: null }, { ...publication, snapshotId: null }, { ...publication, seasonId: null }, { ...publication, players: [] },
    { ...publication, players: [{ ...publication.players[0], totalRating: Number.NaN }] },
    { ...publication, players: [{ ...publication.players[0], minutesPlayed: -1 }] },
  ];
  for (const value of invalid) {
    assert.deepEqual(projectTouchlinePublishedRankingCatalog(catalogue, value), {
      phase: "incomplete", reason: "invalid-ranking", missingPlayerIds: [], cards: [],
    });
  }
});
