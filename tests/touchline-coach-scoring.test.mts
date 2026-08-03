import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTouchlineCoachMatchScore,
  TOUCHLINE_COACH_SCORING_DRAFT,
  TOUCHLINE_COACH_SCORING_VERSION,
  TOUCHLINE_COACH_SCORING_WEIGHTS,
  touchlineCoachScoringDraftIsComplete,
  touchlineCoachScoringWeightsAreValid,
  type TouchlineCoachScoringWeights,
} from "../lib/touchlineArena/coach-scoring.ts";

const validWeights: TouchlineCoachScoringWeights = {
  homeWin: 3,
  awayWin: 4,
  homeDraw: 1,
  awayDraw: 2,
  homeLoss: -4,
  awayLoss: -3,
  yellowCard: -1,
  redCard: -3,
};

test("keeps the complete owner-approved formula under one version", () => {
  assert.deepEqual(TOUCHLINE_COACH_SCORING_DRAFT, {
    homeWin: 3,
    awayWin: 4,
    homeDraw: 1,
    awayDraw: 2,
    homeLoss: -4,
    awayLoss: -3,
    yellowCard: -1,
    redCard: -3,
  });
  assert.equal(touchlineCoachScoringDraftIsComplete(TOUCHLINE_COACH_SCORING_DRAFT), true);
  assert.equal(touchlineCoachScoringDraftIsComplete(validWeights), true);
  assert.deepEqual(TOUCHLINE_COACH_SCORING_WEIGHTS, validWeights);
  assert.equal(TOUCHLINE_COACH_SCORING_VERSION, "coach-points-v1");
});

test("coach formula enforces every owner-approved ordering rule", () => {
  assert.equal(touchlineCoachScoringWeightsAreValid(validWeights), true);
  assert.equal(touchlineCoachScoringWeightsAreValid({ ...validWeights, awayWin: 3 }), false);
  assert.equal(touchlineCoachScoringWeightsAreValid({ ...validWeights, awayDraw: 0 }), false);
  assert.equal(touchlineCoachScoringWeightsAreValid({ ...validWeights, homeLoss: 0 }), false);
  assert.equal(touchlineCoachScoringWeightsAreValid({ ...validWeights, redCard: -0.25 }), false);
});

test("coach score combines the real result with team discipline without player points", () => {
  const score = calculateTouchlineCoachMatchScore({
    fixtureId: "fixture:123",
    coachProviderId: "coach:456",
    venue: "away",
    result: "win",
    yellowCards: 2,
    redCards: 1,
  }, validWeights);

  assert.deepEqual(score, {
    fixtureId: "fixture:123",
    coachProviderId: "coach:456",
    resultPoints: 4,
    disciplinePoints: -5,
    totalPoints: -1,
  });
});

test("coach scoring refuses unverified identities and invalid discipline totals", () => {
  assert.throws(() => calculateTouchlineCoachMatchScore({
    fixtureId: "",
    coachProviderId: "coach:456",
    venue: "home",
    result: "draw",
    yellowCards: 0,
    redCards: 0,
  }, validWeights));
  assert.throws(() => calculateTouchlineCoachMatchScore({
    fixtureId: "fixture:123",
    coachProviderId: "coach:456",
    venue: "home",
    result: "loss",
    yellowCards: -1,
    redCards: 0,
  }, validWeights));
});
