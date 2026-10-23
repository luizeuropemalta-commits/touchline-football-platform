import assert from "node:assert/strict";
import test from "node:test";
import { projectTouchlineSeasonCard, resolveTouchlineSeasonPlayer } from "../lib/touchlineArena/player-season-presentation.ts";
import { advanceCardLeadershipRead, resetCardLeadershipSeed, buildTouchlineCardLeadershipValue } from "../lib/touchlineArena/card-leadership-authority.ts";
import { TOUCHLINE_PRESEASON_RANKING_STATE } from "../lib/touchlineArena/card-ranking-live.ts";
import type { ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

const id = "10000000-0000-4000-8000-000000000001";
const ranking = (totalRating: number | null, seasonId = "season") => ({
  ...TOUCHLINE_PRESEASON_RANKING_STATE, phase: "ranked" as const, snapshotId: `snapshot-${totalRating}`, seasonId, scoringVersion: "player_scoring_v4" as const,
  players: [{ playerId: id, providerPlayerId: "123", totalRating, positionGroup: "striker" as const, positionRank: 1, groupSize: 1,
    minutesPlayed: 90, appearances: 1, tierKey: "radiant-gold" as const, priceTc: 999 }],
});
const authority = (total: number | null) => buildTouchlineCardLeadershipValue(ranking(total), null);
const card: ClubOwnerSquadCard = { id, canonicalPlayerId: id, providerPlayerId: "123", name: "Player", shortName: "Player", clubName: "Club",
  position: "Striker", role: "ST", countryCode3: "ENG", shirtNumber: 9, marketValue: "€1m", touchlinePoints: 999,
  seasonTotalRating: 42, matchRating: 7, seasonStats: { goals: 5 }, matchStats: { goals: 1 }, cardPriceAuthority: "active-contract" };

test("season overlay changes only the public total, retaining economics, identity and match/season facts", () => {
  const before = JSON.stringify(card);
  for (const total of [47, 41, 0, null]) {
    const actual = projectTouchlineSeasonCard(card, authority(total), true);
    assert.deepEqual(actual, { ...card, seasonTotalRating: total });
    assert.equal(actual.matchStats, card.matchStats); assert.equal(actual.seasonStats, card.seasonStats);
  }
  assert.equal(projectTouchlineSeasonCard(card, authority(42), true), card);
  assert.equal(projectTouchlineSeasonCard(card, authority(99)), card);
  assert.equal(projectTouchlineSeasonCard(card, null, true), card);
  assert.equal(projectTouchlineSeasonCard(card, buildTouchlineCardLeadershipValue(null, null), true), card);
  assert.equal(JSON.stringify(card), before);
});

test("canonical identity and provider must agree; no name or provider-only borrowing", () => {
  const input = { enabled: true, authority: authority(50), playerId: id, providerPlayerId: "123" };
  assert.equal(resolveTouchlineSeasonPlayer(input)?.totalRating, 50);
  for (const changes of [{ playerId: "Player" }, { playerId: null }])
    assert.equal(resolveTouchlineSeasonPlayer({ ...input, ...changes }), undefined);
  for (const changes of [{ providerPlayerId: "wrong" }, { playerId: id.replace(/1$/, "2") }])
    assert.equal(resolveTouchlineSeasonPlayer({ ...input, ...changes }), null);
  const unresolved = { ...card, id: "123", canonicalPlayerId: undefined };
  assert.equal(projectTouchlineSeasonCard(unresolved, authority(50), true), unresolved);
  assert.equal(resolveTouchlineSeasonPlayer({ ...input, seasonId: "other-season" }), undefined);
  assert.equal(resolveTouchlineSeasonPlayer({ ...input, enabled: false }), undefined);
  assert.equal(resolveTouchlineSeasonPlayer({ ...input, authority: { ...input.authority, playerRanking: { ...ranking(50), players: [...ranking(50).players, ...ranking(50).players] } } }), null);
});

test("accepted revisions permit decreases/reactivation, preserve mount floor, failure and season, and withdraw explicitly", () => {
  let accepted = resetCardLeadershipSeed(authority(42), 1, 5);
  const read = { state: ranking(50), coachRanking: null, revision: 2, requestEpoch: 6, publicationDigest: "a".repeat(32) };
  assert.equal(advanceCardLeadershipRead(accepted, { ...read, requestEpoch: 5 }), accepted);
  for (const [index, total] of [50, 41, 0, 50].entries()) {
    accepted = advanceCardLeadershipRead(accepted, { ...read, state: ranking(total), revision: index + 2 });
    assert.equal(projectTouchlineSeasonCard(card, accepted.current, true).seasonTotalRating, total);
  }
  assert.equal(advanceCardLeadershipRead(accepted, null), accepted);
  assert.equal(advanceCardLeadershipRead(accepted, { ...read, revision: 9, state: ranking(500, "other") }).current, accepted.current);
  accepted = advanceCardLeadershipRead(accepted, { ...read, revision: 10, state: TOUCHLINE_PRESEASON_RANKING_STATE });
  assert.equal(projectTouchlineSeasonCard(card, accepted.current, true).seasonTotalRating, null);
});
