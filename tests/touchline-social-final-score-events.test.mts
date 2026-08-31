import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTouchlineSocialFinalScoreGoalType,
  touchlineSocialFinalScoreGoalsMatchScore,
} from "../lib/touchlineArena/social-final-score-events.ts";

test("final-score goal classifier accepts the three canonical scoring event types", () => {
  assert.equal(classifyTouchlineSocialFinalScoreGoalType("Goal"), "goal");
  assert.equal(classifyTouchlineSocialFinalScoreGoalType(" Own Goal "), "own-goal");
  assert.equal(classifyTouchlineSocialFinalScoreGoalType("Penalty"), "penalty");
});

test("final-score goal classifier rejects non-scoring and ambiguous event types", () => {
  for (const eventType of ["Yellowcard", "Redcard", "Substitution", "Penalty Missed", "", null, undefined]) {
    assert.equal(classifyTouchlineSocialFinalScoreGoalType(eventType), null);
  }
});

test("final-score reconciliation requires the exact 5-2 scoring distribution", () => {
  const goals = [
    ...Array.from({ length: 5 }, () => ({ teamId: "14" })),
    ...Array.from({ length: 2 }, () => ({ teamId: "116" })),
  ];
  const score = { homeTeamId: "14", awayTeamId: "116", homeScore: 5, awayScore: 2 };
  assert.equal(touchlineSocialFinalScoreGoalsMatchScore(goals, score), true);
  assert.equal(touchlineSocialFinalScoreGoalsMatchScore(goals.slice(0, 6), score), false);
  assert.equal(touchlineSocialFinalScoreGoalsMatchScore([
    ...Array.from({ length: 4 }, () => ({ teamId: "14" })),
    ...Array.from({ length: 3 }, () => ({ teamId: "116" })),
  ], score), false);
  assert.equal(touchlineSocialFinalScoreGoalsMatchScore([...goals, { teamId: "999" }], score), false);
});
