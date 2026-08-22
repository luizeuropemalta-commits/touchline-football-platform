import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_PLAYER_SCORING_VERSION,
  touchLineDefensiveActionScore,
  touchLinePlayerFixturePoints,
} from "../lib/football-data/player-fixture-scoring.ts";
import type { TouchlineFantasyEvent } from "../lib/football-data/types.ts";

const PLAYER = "player-1";

function event(type: string, providerId = type, relatedPlayerId?: string): TouchlineFantasyEvent {
  return { id: providerId, providerId, provider: "sportmonks", type, playerId: PLAYER, relatedPlayerId, status: "recorded" };
}

const confirmedZeroStatistics = {
  "shots-on-target": 0,
  "shots-off-target": 0,
  "tackles-won": 0,
  interceptions: 0,
  clearances: 0,
  "blocked-shots": 0,
  "aerials-won": 0,
  saves: 0,
  "goals-conceded": 0,
};

function score(overrides: Partial<Parameters<typeof touchLinePlayerFixturePoints>[0]> = {}) {
  return touchLinePlayerFixturePoints({
    providerPlayerId: PLAYER,
    positionGroup: "Attacker",
    appearanceStatus: "started",
    minutesPlayed: 90,
    rating: 6.5,
    statistics: confirmedZeroStatistics,
    events: [],
    teamGoalsConceded: 1,
    ...overrides,
  });
}

function pointsForRule(result: ReturnType<typeof score>, ruleCode: string) {
  return result.contributions.filter((item) => item.ruleCode === ruleCode).reduce((sum, item) => sum + item.points, 0);
}

test("player_scoring_v2 is an explicit immutable scoring identity", () => {
  assert.equal(TOUCHLINE_PLAYER_SCORING_VERSION, "player_scoring_v2");
});

test("goals score by canonical position group", () => {
  const expected = { Goalkeeper: 6, Defender: 5, Midfielder: 4, Attacker: 3 } as const;
  for (const [positionGroup, points] of Object.entries(expected)) {
    assert.equal(pointsForRule(score({ positionGroup, events: [event("Goal")] }), "goal"), points);
  }
});

test("assist is +2 and shot on target is +1 while off target is zero", () => {
  const assist = event("Goal", "goal-by-team-mate", PLAYER);
  assist.playerId = "team-mate";
  assert.equal(pointsForRule(score({ events: [assist] }), "assist"), 2);
  assert.equal(pointsForRule(score({ statistics: { ...confirmedZeroStatistics, "shots-on-target": 3, "shots-off-target": 4 } }), "shot-on-target"), 3);
  assert.equal(score({ statistics: { ...confirmedZeroStatistics, "shots-off-target": 4 } }).contributions.some((item) => item.eventType === "Shots off target"), false);
});

test("yellow, red and second-yellow discipline never double punish", () => {
  assert.equal(pointsForRule(score({ events: [event("Yellowcard")] }), "yellow-card"), -1);
  assert.equal(pointsForRule(score({ events: [event("Red card")] }), "red-card"), -3);
  const secondYellow = score({ events: [event("Yellowred Card")] });
  assert.equal(pointsForRule(secondYellow, "red-card"), -3);
  assert.equal(pointsForRule(secondYellow, "yellow-card"), 0);
});

test("penalty save, penalty missed and own goal use the approved values", () => {
  assert.equal(pointsForRule(score({ positionGroup: "Goalkeeper", events: [event("Penalty save")] }), "penalty-save"), 3);
  assert.equal(pointsForRule(score({ events: [event("Penalty missed")] }), "penalty-missed"), -1);
  assert.equal(pointsForRule(score({ events: [event("Own Goal")] }), "own-goal"), -1);
});

test("one hat-trick bonus is added after three or more valid goals", () => {
  const goals = [1, 2, 3, 4, 5, 6].map((number) => event("Goal", `goal-${number}`));
  const result = score({ events: goals });
  assert.equal(pointsForRule(result, "goal"), 18);
  assert.equal(pointsForRule(result, "hat-trick"), 3);
  assert.equal(result.contributions.filter((item) => item.ruleCode === "hat-trick").length, 1);
});

test("0-0 clean sheet awards only actual participants by position", () => {
  const expected = { Goalkeeper: 2, Defender: 2, Midfielder: 1, Attacker: 1 } as const;
  for (const [positionGroup, points] of Object.entries(expected)) {
    assert.equal(pointsForRule(score({ positionGroup, teamGoalsConceded: 0 }), "clean-sheet"), points);
  }
  assert.equal(pointsForRule(score({ positionGroup: "Defender", appearanceStatus: "unused", minutesPlayed: null, teamGoalsConceded: 0 }), "clean-sheet"), 0);
});

test("goalkeeper saves and GK/DEF goals conceded are role-scoped", () => {
  assert.equal(pointsForRule(score({ positionGroup: "Goalkeeper", statistics: { ...confirmedZeroStatistics, saves: 4 } }), "save"), 4);
  assert.equal(pointsForRule(score({ positionGroup: "Goalkeeper", statistics: { ...confirmedZeroStatistics, "goals-conceded": 2 } }), "goal-conceded"), -2);
  assert.equal(pointsForRule(score({ positionGroup: "Defender", statistics: { ...confirmedZeroStatistics, "goals-conceded": 2 } }), "goal-conceded"), -2);
  assert.equal(pointsForRule(score({ positionGroup: "Midfielder", statistics: { ...confirmedZeroStatistics, "goals-conceded": 2 } }), "goal-conceded"), 0);
  assert.equal(pointsForRule(score({ positionGroup: "Attacker", statistics: { ...confirmedZeroStatistics, "goals-conceded": 2 } }), "goal-conceded"), 0);
});

test("rating thresholds preserve missing as unavailable", () => {
  const cases = [[5.99, -1], [6.5, 0], [7.5, 1], [8.5, 2], [9, 3]] as const;
  for (const [rating, expected] of cases) assert.equal(pointsForRule(score({ rating }), "rating"), expected);
  const missing = score({ rating: null });
  assert.equal(missing.missingFacts.includes("rating"), true);
  assert.equal(Object.hasOwn(missing.statistics, "rating"), false);
});

test("DEF thresholds are position-specific and goalkeeper is excluded", () => {
  assert.equal(touchLineDefensiveActionScore("Defender", 7), 0);
  assert.equal(touchLineDefensiveActionScore("Defender", 8), 1);
  assert.equal(touchLineDefensiveActionScore("Defender", 15), 2);
  assert.equal(touchLineDefensiveActionScore("Midfielder", 4), 0);
  assert.equal(touchLineDefensiveActionScore("Midfielder", 5), 1);
  assert.equal(touchLineDefensiveActionScore("Midfielder", 9), 2);
  assert.equal(touchLineDefensiveActionScore("Attacker", 6), 0);
  assert.equal(touchLineDefensiveActionScore("Attacker", 7), 1);
  assert.equal(touchLineDefensiveActionScore("Goalkeeper", 99), null);
});

test("DEF includes only the five approved facts and excludes recovery/duels/tackles totals", () => {
  const result = score({
    positionGroup: "Midfielder",
    statistics: {
      ...confirmedZeroStatistics,
      "tackles-won": 1,
      interceptions: 1,
      clearances: 1,
      "blocked-shots": 1,
      "aerials-won": 1,
      "ball-recovery": 500,
      "duels-won": 500,
      tackles: 500,
    },
  });
  assert.equal(result.statistics["defensive-actions-total"], 5);
  assert.equal(result.statistics["def-score"], 1);
});

test("missing count is unavailable while a provider-confirmed zero remains zero", () => {
  const missing = score({ statistics: { ...confirmedZeroStatistics, "shots-on-target": undefined as unknown as number } });
  assert.equal(missing.missingFacts.includes("shots-on-target"), true);
  assert.equal(Object.hasOwn(missing.statistics, "shots-on-target"), false);
  const zero = score();
  assert.equal(zero.statistics["shots-on-target"], 0);
});

test("provider event identity makes a second reconciliation idempotent", () => {
  const goal = event("Goal", "same-provider-event");
  assert.deepEqual(score({ events: [goal, goal] }), score({ events: [goal] }));
});
