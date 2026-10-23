import assert from "node:assert/strict";
import test from "node:test";
import { projectTouchlinePublishedRankingAwards } from "../lib/touchlineArena/published-ranking-awards.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { touchlinePlayerLeadershipScope } from "../lib/touchlineArena/player-ranking-leadership.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";
import type { LeadershipDecision } from "../lib/touchlineArena/leadership-decision.ts";

const playerId = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const providerId = (index: number) => String(1000 + index);
function card(index: number): ClubOwnerSquadCard {
  return {
    id: playerId(index), canonicalPlayerId: playerId(index), providerPlayerId: providerId(index),
    name: `Player ${index}`, shortName: `P${index}`, clubName: `Club ${index}`,
    role: "ST", position: "Striker", shirtNumber: index, countryCode3: "ENG", marketValue: "€1m",
    cardTier: "ruby-red", cardPriceAuthority: "active-contract", inventoryId: `inventory-${index}`,
    editorialCard: { tierKey: "ruby-red", cardPrice: { amountMinor: 1500, currency: "TC" }, lastReviewedAt: "2026-10-01T00:00:00Z" },
    seasonTotalRating: 999, touchlinePoints: 888, seasonTouchlinePoints: 777,
    publishedRanking: { snapshotId: "old", providerPlayerId: providerId(index), totalRating: 999, minutesPlayed: 999, appearances: 99 },
    matchRating: 7, matchTouchlinePoints: 99, matchStats: { goals: 1 }, seasonStats: { goals: 500, minutes: 9999 },
  };
}
function unique(snapshotId: string, index: number): LeadershipDecision {
  return { status: "unique-leader", scope: touchlinePlayerLeadershipScope(snapshotId),
    leader: { subjectType: "player", subjectId: playerId(index) } };
}
function publication(
  snapshotId = "A",
  totals: Array<number | null> = Array.from({ length: 25 }, (_, index) => 100 - index),
  goals: Array<number | null> = totals.map((_, index) => index === 0 ? 1 : 0),
): TouchlineActiveRankingState {
  return {
    ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked", snapshotId, seasonId: "season-2026", roundId: "8",
    publishedAt: "2026-10-23T10:00:00Z", scoringVersion: "player_scoring_v4", coverageStatus: "complete_for_scoring",
    fixtureIds: ["fixture-1"], expectedFixtureIds: ["fixture-1"], totalScorePoints: 0,
    players: totals.map((totalRating, index) => ({ playerId: playerId(index), providerPlayerId: providerId(index),
      totalRating, minutesPlayed: 90, appearances: 1, positionGroup: "striker", positionRank: index + 1,
      groupSize: totals.length, tierKey: "diamond-gold", priceTc: 999999 })),
    leadershipDecision: unique(snapshotId, 0),
    cardGoals: { source: "published-card-goals-v1", snapshotId,
      rows: goals.map((goals, index) => ({ playerId: playerId(index), goals })) },
  };
}
const ids = (cards: readonly ClubOwnerSquadCard[]) => cards.map(card => card.canonicalPlayerId);

function assertUnchangedFacts(projected: ClubOwnerSquadCard, original: ClubOwnerSquadCard) {
  assert.deepEqual({ ...projected, seasonTotalRating: original.seasonTotalRating, publishedRanking: original.publishedRanking }, original);
  assert.equal(projected.editorialCard, original.editorialCard);
  assert.equal(projected.matchStats, original.matchStats);
  assert.equal(projected.seasonStats, original.seasonStats);
}

test("all candidates drive points/podium and goals independently, including A -> outside top20 -> A", () => {
  const catalogue = Array.from({ length: 25 }, (_, index) => card(index));
  const before = JSON.stringify(catalogue);
  const a = publication();
  const b = publication("B");
  b.players = b.players.map((row, index) => index === 20 ? { ...row, totalRating: 120 } : row);
  b.leadershipDecision = unique("B", 20);
  b.cardGoals = { ...b.cardGoals!, rows: b.cardGoals!.rows.map((row, index) => index === 17 ? { ...row, goals: 9 } : row) };
  b.publishedAt = "2026-10-23T11:00:00Z";
  const first = projectTouchlinePublishedRankingAwards(catalogue, a);
  assert.equal(first.rating.phase, "ready");
  assert.ok(!first.rating.cards.slice(0, 20).some(card => card.canonicalPlayerId === playerId(20)));
  for (const state of [a, b, a]) {
    const result = projectTouchlinePublishedRankingAwards(catalogue, state);
    assert.equal(result.rating.cards.length, 25);
    assert.deepEqual(ids(result.podium), (state === b ? [20, 0, 1] : [0, 1, 2]).map(playerId));
    assert.equal(result.goldenBall.phase, "ready");
    assert.deepEqual(result.goldenBall.awardedPlayerIds, [playerId(state === b ? 20 : 0)]);
    assert.equal(result.goldenBoot.phase, "ready");
    assert.deepEqual(result.goldenBoot.awardedPlayerIds, [playerId(state === b ? 17 : 0)]);
    if (result.goldenBoot.phase === "ready") assert.equal(result.goldenBoot.value, state === b ? 9 : 1);
    for (const projected of [...result.rating.cards, ...result.goldenBoot.contenders]) {
      assertUnchangedFacts(projected, catalogue.find(card => card.canonicalPlayerId === projected.canonicalPlayerId)!);
    }
  }
  assert.deepEqual(projectTouchlinePublishedRankingAwards(catalogue, a), first, "creation time cannot suppress a valid reactivation");
  assert.equal(JSON.stringify(catalogue), before);
});

test("unknown rated candidate blocks the whole rating, and every goals identity must resolve before awarding", () => {
  const catalogue = [card(0), card(1)];
  const next = publication("C", [10, 9, 20]);
  next.leadershipDecision = unique("C", 2);
  const incomplete = projectTouchlinePublishedRankingAwards(catalogue, next);
  assert.equal(incomplete.rating.phase, "incomplete");
  assert.deepEqual(incomplete.podium, []);
  assert.deepEqual(incomplete.goldenBall.awardedPlayerIds, []);
  assert.equal(incomplete.goldenBoot.phase, "incomplete");
  assert.deepEqual(projectTouchlinePublishedRankingAwards([...catalogue, card(2)], next).goldenBall.awardedPlayerIds, [playerId(2)]);
  for (const extraGoals of [0, 99, null]) {
    const goalsOnly = publication("goals", [10, 9], [1, 0, extraGoals]);
    const result = projectTouchlinePublishedRankingAwards(catalogue, goalsOnly);
    assert.equal(result.rating.phase, "ready", "independently complete points are retained");
    assert.equal(result.goldenBoot.phase, "incomplete", "even a non-leading missing card cannot be silently omitted");
    if (result.goldenBoot.phase === "incomplete") assert.deepEqual(result.goldenBoot.missingPlayerIds, [playerId(2)]);
    assert.deepEqual(result.goldenBoot.awardedPlayerIds, []);
  }
});

test("goals-only winner is included without borrowing its stale rating, economics or match history", () => {
  const catalogue = [card(0), card(1), card(2)];
  const result = projectTouchlinePublishedRankingAwards(catalogue, publication("goals-only", [10, 9], [1, 0, 7]));
  assert.deepEqual(ids(result.rating.cards), [playerId(0), playerId(1)]);
  assert.equal(result.goldenBoot.phase, "ready");
  assert.deepEqual(result.goldenBoot.awardedPlayerIds, [playerId(2)]);
  const winner = result.goldenBoot.contenders[0];
  assert.equal(winner.seasonTotalRating, null);
  assert.equal(winner.publishedRanking, undefined);
  assert.equal(winner.providerPlayerId, providerId(2));
  assertUnchangedFacts(winner, catalogue[2]);
  assert.equal(catalogue[2].seasonTotalRating, 999);
});

test("zero and negative totals remain real ratings while an explicit null is never zero", () => {
  const catalogue = [card(0), card(1), card(2)];
  const zero = publication("zero", [null, 0, -2], [5, 0, null]);
  zero.leadershipDecision = unique("zero", 1);
  const result = projectTouchlinePublishedRankingAwards(catalogue, zero);
  assert.deepEqual(ids(result.rating.cards), [playerId(1), playerId(2)]);
  assert.equal(result.rating.cards[0].seasonTotalRating, 0);
  assert.deepEqual(result.goldenBall.awardedPlayerIds, [playerId(1)]);
  assert.equal(result.goldenBoot.contenders[0].seasonTotalRating, null);
  const negative = publication("negative", [-2, -4, -1], [0, 0, 0]);
  negative.leadershipDecision = unique("negative", 2);
  const projected = projectTouchlinePublishedRankingAwards(catalogue, negative);
  assert.deepEqual(projected.rating.cards.map(card => card.seasonTotalRating), [-1, -2, -4]);
  assert.deepEqual(projected.goldenBall.awardedPlayerIds, [playerId(2)]);
  assert.equal(projected.goldenBoot.phase, "pending");
});

test("classification/position first cannot grant a Ball without the exact published decision", () => {
  const catalogue = [card(0), card(1)];
  const state = publication("authority", [10, 9]);
  for (const decision of [
    undefined, null,
    { status: "unavailable", scope: touchlinePlayerLeadershipScope("authority"), reason: "pending" },
    unique("other-snapshot", 0),
    { ...unique("authority", 0), scope: { rankingId: "position-striker", snapshotId: "authority" } },
  ] as const) {
    const result = projectTouchlinePublishedRankingAwards(catalogue, { ...state, leadershipDecision: decision });
    assert.equal(result.rating.phase, "ready");
    assert.deepEqual(ids(result.podium), [playerId(0), playerId(1)]);
    assert.equal(result.goldenBall.phase, "pending");
    assert.deepEqual(result.goldenBall.awardedPlayerIds, []);
  }
  const conflicting = projectTouchlinePublishedRankingAwards(catalogue, { ...state, leadershipDecision: unique("authority", 1) });
  assert.equal(conflicting.goldenBall.phase, "incomplete");
  assert.deepEqual(conflicting.goldenBall.awardedPlayerIds, []);
  const withdrawn = projectTouchlinePublishedRankingAwards(catalogue, { ...state, leadershipDecision: {
    status: "withdrawn", scope: touchlinePlayerLeadershipScope("authority"), subject: { subjectType: "player", subjectId: playerId(0) },
  } });
  assert.equal(withdrawn.goldenBall.phase, "withdrawn");
  assert.equal(withdrawn.rating.cards.length, 2);
});

test("uppercase ranking UUID keeps its original published leadership identity without weakening the decision contract", () => {
  const catalogue = [card(0), card(1)];
  const state = publication("uppercase", [10, 9], [3, 1]);
  const publishedId = playerId(0).toUpperCase();
  state.players = state.players.map((row, index) => index === 0 ? { ...row, playerId: publishedId } : row);
  state.leadershipDecision = {
    status: "unique-leader", scope: touchlinePlayerLeadershipScope("uppercase"),
    leader: { subjectType: "player", subjectId: publishedId },
  };
  const before = JSON.stringify({ catalogue, state });
  const result = projectTouchlinePublishedRankingAwards(catalogue, state);
  assert.equal(result.rating.phase, "ready");
  assert.equal(result.goldenBall.phase, "ready");
  assert.deepEqual(result.goldenBall.awardedPlayerIds, [playerId(0)]);
  assert.deepEqual(result.goldenBoot.awardedPlayerIds, [playerId(0)]);
  assert.equal(JSON.stringify({ catalogue, state }), before);

  // The existing decoder requires the decision to name an original row. Do
  // not normalize an otherwise unadmitted decision into a new award grant.
  const unadmittedDecision = projectTouchlinePublishedRankingAwards(catalogue, {
    ...state, leadershipDecision: unique("uppercase", 0),
  });
  assert.equal(unadmittedDecision.goldenBall.phase, "pending");
  assert.deepEqual(unadmittedDecision.goldenBall.awardedPlayerIds, []);
});

test("a published Ball tie stays unawarded; all positive joint goals leaders receive the Boot", () => {
  const catalogue = [card(0), card(1), card(2)];
  const state = publication("ties", [10, 10, 9], [3, 3, 1]);
  state.leadershipDecision = { status: "tied", scope: touchlinePlayerLeadershipScope("ties"),
    contenders: [0, 1].map(index => ({ subjectType: "player", subjectId: playerId(index) })) };
  const result = projectTouchlinePublishedRankingAwards(catalogue, state);
  assert.equal(result.goldenBall.phase, "ready");
  if (result.goldenBall.phase === "ready") assert.equal(result.goldenBall.status, "tied");
  assert.deepEqual(ids(result.goldenBall.contenders), [playerId(0), playerId(1)]);
  assert.deepEqual(result.goldenBall.awardedPlayerIds, []);
  assert.equal(result.goldenBoot.phase, "ready");
  if (result.goldenBoot.phase === "ready") assert.equal(result.goldenBoot.status, "tied");
  assert.deepEqual(result.goldenBoot.awardedPlayerIds, [playerId(0), playerId(1)]);
  const noTiebreak = { ...state, leadershipDecision: unique("ties", 0),
    players: state.players.map(row => ({ ...row, minutesPlayed: null })) };
  assert.equal(projectTouchlinePublishedRankingAwards(catalogue, noTiebreak).goldenBall.phase, "incomplete");
  const canonicalTiebreak = { ...state, leadershipDecision: unique("ties", 1),
    players: state.players.map((row, index) => index === 1 ? { ...row, minutesPlayed: 180 } : row) };
  assert.deepEqual(projectTouchlinePublishedRankingAwards(catalogue, canonicalTiebreak).goldenBall.awardedPlayerIds, [playerId(1)]);
});

test("missing/zero/unknown goals remain pending, malformed or cross-snapshot goals are incomplete, never a name preview", () => {
  const catalogue = [{ ...card(0), name: "Erling Haaland" }, card(1)];
  for (const goals of [[0, 0], [null, null], [0, null]]) {
    const result = projectTouchlinePublishedRankingAwards(catalogue, publication("no-goals", [10, 9], goals));
    assert.equal(result.goldenBoot.phase, "pending");
    assert.deepEqual(result.goldenBoot.contenders, []);
    assert.deepEqual(result.goldenBoot.awardedPlayerIds, []);
  }
  const state = publication("goals", [10, 9]);
  assert.equal(projectTouchlinePublishedRankingAwards(catalogue, { ...state, cardGoals: null }).goldenBoot.phase, "pending");
  for (const cardGoals of [
    { ...state.cardGoals!, snapshotId: "other" },
    { ...state.cardGoals!, rows: [state.cardGoals!.rows[0], state.cardGoals!.rows[0]] },
    ...[-1, 0.5, NaN, Infinity].map(goals => ({ ...state.cardGoals!, rows: [{ playerId: playerId(0), goals }] })),
  ]) {
    const result = projectTouchlinePublishedRankingAwards(catalogue, { ...state, cardGoals });
    assert.equal(result.goldenBoot.phase, "incomplete");
    assert.deepEqual(result.goldenBoot.awardedPlayerIds, []);
  }
});

test("identities/providers and editorial publication must be proven, including unrated goals candidates", () => {
  const state = publication("identity", [10, null], [1, 3, 5]);
  for (const catalogue of [
    [card(0), { ...card(1), providerPlayerId: "wrong" }, card(2)],
    [card(0), card(1), { ...card(2), providerPlayerId: null }],
    [card(0), card(1), { ...card(2), providerPlayerId: providerId(0) }],
    [card(0), card(1), { ...card(2), canonicalPlayerId: playerId(0) }],
    [card(0), card(1), { ...card(2), canonicalPlayerId: "name-only" }],
    [card(0), card(1), { ...card(2), editorialCard: null }],
    [card(0), card(1), { ...card(2), editorialCard: { ...card(2).editorialCard!, lastReviewedAt: "not-a-date" } }],
  ]) {
    const result = projectTouchlinePublishedRankingAwards(catalogue, state);
    assert.equal(result.goldenBoot.phase, "incomplete");
    assert.deepEqual(result.goldenBoot.awardedPlayerIds, []);
  }
  const unpublished = projectTouchlinePublishedRankingAwards([{ ...card(0), editorialCard: null }, card(1), card(2)], state);
  assert.equal(unpublished.rating.phase, "incomplete");
  assert.equal(unpublished.goldenBall.phase, "incomplete");
  const malformed = projectTouchlinePublishedRankingAwards([{ ...card(0), editorialCard: {} as never }, card(1), card(2)], state);
  assert.equal(malformed.rating.phase, "incomplete");
  assert.deepEqual(malformed.podium, []);
});

test("null/preseason withdraw all previous awards and podium; explicit rated null never creates a new leader", () => {
  const catalogue = [card(0)];
  for (const state of [null, TOUCHLINE_PRESEASON_RANKING_STATE]) {
    const result = projectTouchlinePublishedRankingAwards(catalogue, state);
    assert.equal(result.rating.phase, "withdrawn");
    assert.deepEqual(result.podium, []);
    for (const award of [result.goldenBall, result.goldenBoot]) {
      assert.equal(award.phase, "withdrawn");
      assert.deepEqual(award.contenders, []);
      assert.deepEqual(award.awardedPlayerIds, []);
    }
  }
  const unrated = projectTouchlinePublishedRankingAwards(catalogue, publication("unrated", [null], [5]));
  assert.equal(unrated.rating.phase, "ready");
  assert.deepEqual(unrated.podium, []);
  assert.equal(unrated.goldenBall.phase, "pending");
  assert.deepEqual(unrated.goldenBoot.awardedPlayerIds, [playerId(0)]);
  assert.equal(unrated.goldenBoot.contenders[0].seasonTotalRating, null);
});
