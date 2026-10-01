import assert from "node:assert/strict";
import test from "node:test";
import { projectTouchlineRankingsHighlights } from "../lib/touchlineArena/rankings-highlight-projection.ts";
import { resolveTouchlinePublishedGameweekBest } from "../lib/touchlineArena/published-gameweek-best.ts";
import { compareTouchLineRankedCards } from "../lib/touchlineArena/ranked-card-catalog.ts";
import { TOUCHLINE_SELECTION_SLOTS } from "../lib/touchlineArena/touchline-selection.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import type { TouchlinePublishedTopEleven } from "../lib/touchlineArena/published-top-eleven.ts";

const selection: TouchlinePublishedTopEleven = {
  snapshotId: "snapshot", roundId: "round", publishedAt: "2026-10-01T00:00:00Z", coach: null,
  slots: TOUCHLINE_SELECTION_SLOTS.map((slot, n) => ({ ...slot, playerIds: [`player-${n}`] })),
};
function card(n: number, overrides = {}): ClubOwnerSquadCard {
  return { id: `card-${n}`, canonicalPlayerId: `player-${n}`, name: `Player ${n}`, seasonTotalRating: n,
    editorialCard: { tierKey: "elite" }, matchRating: 0, matchStats: { goals: n },
    cardReview: { source: "preserved" }, ...overrides } as unknown as ClubOwnerSquadCard;
}
function assertParity(cards: ClubOwnerSquadCard[], xi: TouchlinePublishedTopEleven | null) {
  const before = JSON.stringify(cards);
  const published = cards.filter(value => Boolean(value.editorialCard));
  const expected = {
    gameweekBest: resolveTouchlinePublishedGameweekBest({ selection: xi, cards: published }),
    topPlayerCards: published.filter(value => value.seasonTotalRating != null).sort(compareTouchLineRankedCards).slice(0, 3),
  };
  const actual = projectTouchlineRankingsHighlights(cards, xi);
  assert.deepEqual(actual, expected, "same selection as the former client computation");
  assert.equal(JSON.stringify(cards), before, "full server catalogue is unchanged");
  return actual;
}
test("385-card catalogue projects at most fourteen complete cards and preserves XI slots and zoom data", () => {
  const cards = Array.from({ length: 385 }, (_, n) => card(n));
  const projected = assertParity(cards, selection);
  assert.equal(projected.gameweekBest.phase, "ready");
  if (projected.gameweekBest.phase !== "ready") return;
  assert.deepEqual(projected.topPlayerCards.map(value => value.id), ["card-384", "card-383", "card-382"]);
  assert.equal(projected.gameweekBest.slots.length + projected.topPlayerCards.length, 14);
  projected.gameweekBest.slots.forEach((entry, n) => {
    assert.equal(entry.slot, selection.slots[n]);
    assert.equal(entry.card, cards[n], "retain the entire original card for zoom/profile");
  });
  assert.equal(cards.length, 385);
  assert.ok(JSON.stringify(projected).length < JSON.stringify(cards).length / 5);
});
test("incomplete, absent and duplicate-identity XI remain unavailable without dropping the podium", () => {
  const cards = Array.from({ length: 11 }, (_, n) => card(n));
  for (const [input, xi] of [
    [cards.slice(1), selection], [cards, null],
    [[...cards.slice(0, 10), card(10, { canonicalPlayerId: "player-0" })], selection],
    [[...cards.slice(0, 10), card(10, { editorialCard: undefined })], selection],
  ] as const) {
    const actual = assertParity([...input], xi);
    assert.equal(actual.gameweekBest.phase, "unavailable");
    assert.equal(actual.topPlayerCards.length, 3);
  }
});
test("alias resolution, null versus zero and canonical tie breakers are preserved", () => {
  const cards = [card(1, { seasonTotalRating: null }), card(2, { seasonTotalRating: 0 }),
    card(3, { seasonTotalRating: 5, seasonStats: { minutes: 20, appearances: 1 } }),
    card(4, { seasonTotalRating: 5, seasonStats: { minutes: 20, appearances: 2 } }),
    card(5, { seasonTotalRating: 5, seasonStats: { minutes: 20, appearances: 2 } }),
    card(6, { seasonTotalRating: 100, editorialCard: undefined })];
  assert.deepEqual(assertParity(cards, null).topPlayerCards.map(value => value.id), ["card-4", "card-5", "card-3"]);
  assert.deepEqual(assertParity(cards.slice(0, 2), null).topPlayerCards.map(value => value.id), ["card-2"]);
  const xiCards = Array.from({ length: 11 }, (_, n) => card(n));
  const aliasSelection = { ...selection, slots: selection.slots.map((slot, n) => ({ ...slot, playerIds: [`missing-${n}`, `card-${n}`] })) };
  assert.equal(assertParity(xiCards, aliasSelection).gameweekBest.phase, "ready");
});
