import assert from "node:assert/strict";
import test from "node:test";

import { touchLinePlayerFixtureEventStatistics, touchLinePlayerFixturePoints } from "../lib/football-data/player-fixture-scoring.ts";
import { buildTouchLinePlayerSeasonAggregate } from "../lib/football-data/player-season-statistics-sync.ts";
import { touchLinePlayerFixtureScoreV3 } from "../lib/football-data/player-score-engine-v3.ts";
import type { TouchlineFantasyEvent } from "../lib/football-data/types.ts";

const PLAYER = "31504";
function event(type: string, providerId = type, overrides: Partial<TouchlineFantasyEvent> = {}): TouchlineFantasyEvent {
  return { id: providerId, providerId, provider: "sportmonks", type, playerId: PLAYER, status: "recorded", ...overrides };
}

function normalizeStatistics(events: TouchlineFantasyEvent[], goals: number, penalties: number) {
  return touchLinePlayerFixturePoints({
    providerPlayerId: PLAYER, positionGroup: "Midfielder", appearanceStatus: "started",
    minutesPlayed: 90, rating: 9.51, teamGoalsConceded: 0,
    statistics: { goals, "penalties-scored": penalties }, events,
  });
}

test("exact recorded Goal and Penalty events count once, including corrected duplicate IDs", () => {
  const penalty = event("Penalty", "penalty");
  const facts = touchLinePlayerFixtureEventStatistics(PLAYER, [
    event("Goal", "goal"), penalty, penalty,
    event("Goal", "reversed"), event("Goal", "reversed", { status: "rescinded" }),
    event("Penalty", "cancelled-penalty", { status: "rescinded" }),
  ]);
  assert.equal(facts.goals, 2);
  assert.equal(facts.assists, 0);
});

test("own goals, disallowed/VAR goals, shootouts, misses and saves are not scoring Goal/Penalty types", () => {
  for (const type of [
    "Own Goal", "OwnGoal", "Disallowed Goal", "Goal Disallowed", "VAR Goal", "Goal under review",
    "Penalty Shootout", "Penalty Shootout Goal", "Penalty missed", "Missed Penalty",
    "Penalty save", "Saved Penalty", "Penalty Goal", "Goalkeeper", "", "Unknown",
  ]) {
    const facts = touchLinePlayerFixtureEventStatistics(PLAYER, [event(type, type, { relatedPlayerId: PLAYER })]);
    assert.equal(facts.goals, 0, type);
    assert.equal(facts.assists, 0, type);
  }
});

test("only an eligible Goal credits related-player assists, never a converted Penalty", () => {
  const events = [
    event("Goal", "assisted-goal", { playerId: "other", relatedPlayerId: PLAYER }),
    event("Penalty", "related-penalty", { playerId: "other", relatedPlayerId: PLAYER }),
    event("Goal", "rescinded-assist", { playerId: "other", relatedPlayerId: PLAYER, status: "rescinded" }),
  ];
  assert.equal(touchLinePlayerFixtureEventStatistics(PLAYER, events).assists, 1);
  const normalized = normalizeStatistics(events, 0, 0);
  assert.equal(normalized.statistics.assists, 1);
  assert.equal(normalized.contributions.filter((row) => row.ruleCode === "assist").length, 1);
});

test("fixture normalization uses canonical events, not goals plus penalties-scored", () => {
  const penalty = event("Penalty", "penalty");
  // Provider goals may exclude or already include converted penalties.
  assert.equal(normalizeStatistics([penalty], 0, 1).statistics.goals, 1);
  assert.equal(normalizeStatistics([penalty], 1, 1).statistics.goals, 1);
  assert.equal(normalizeStatistics([event("Goal"), penalty], 2, 1).statistics.goals, 2);
});

test("five-fixture season regression counts three goals/assists while preserving rating 39.16 and V3 points 23", () => {
  // Sanitized fixture facts reproduce the reported QA discrepancy, not a live provider assertion.
  const ratings = [7.53, 7.41, 6.62, 9.51, 8.09];
  const fixtureEvents = [
    [], [event("Goal", "goal-1")], [],
    [event("Penalty", "penalty"),
      event("Goal", "assist-1", { playerId: "other-1", relatedPlayerId: PLAYER }),
      event("Goal", "assist-2", { playerId: "other-2", relatedPlayerId: PLAYER })],
    [event("Goal", "goal-2"), event("Goal", "assist-3", { playerId: "other-3", relatedPlayerId: PLAYER })],
  ];
  const eligibleFixtures = ratings.map((rating, index) => ({
    fixtureId: `fixture-${index}`, events: fixtureEvents[index],
    scoringIncluded: true, scoringComplete: true, rankingCoverageStatus: "complete" as const,
    touchlinePoints: touchLinePlayerFixtureScoreV3(rating).points,
    lineups: [{
      id: `lineup-${index}`, providerId: `lineup-${index}`, provider: "sportmonks" as const,
      fixtureId: `fixture-${index}`, playerId: PLAYER, playerName: "Player", isStarter: true,
      statistics: [
        { typeId: "rating", code: "rating", value: rating },
        { typeId: "minutes", code: "minutes-played", value: 90 },
        { typeId: "goals", code: "goals", value: index === 1 || index === 4 ? 1 : 0 },
        { typeId: "penalties", code: "penalties-scored", value: index === 3 ? 1 : 0 },
      ],
    }],
  }));
  const aggregate = buildTouchLinePlayerSeasonAggregate({
    providerPlayerId: PLAYER,
    season: { seasonId: "season", seasonName: "2026/27", competitionId: "league", competitionName: "League", clubId: "club", clubName: "Club" },
    eligibleFixtures,
  });
  assert.equal(aggregate.summary.goals, 3);
  assert.equal(aggregate.summary.assists, 3);
  assert.equal(aggregate.summary.appearances, 5);
  assert.equal(aggregate.summary.totalRating, 39.16);
  assert.equal(aggregate.coverageStatus, "complete");
  assert.equal(aggregate.expectedFixtureCount, 5);
  assert.deepEqual(aggregate.aggregatedFixtureIds, aggregate.expectedFixtureIds);
  assert.deepEqual(ratings.map((rating) => touchLinePlayerFixtureScoreV3(rating).points), [3, 2, 1, 12, 5]);
  assert.equal(eligibleFixtures.reduce((sum, fixture) => sum + fixture.touchlinePoints!, 0), 23);
  assert.equal(touchLinePlayerFixtureScoreV3(null).points, null);
});
