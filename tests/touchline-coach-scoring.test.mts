import assert from "node:assert/strict";
import test from "node:test";

import {
  TOUCHLINE_COACH_SCORING,
  TOUCHLINE_COACH_SCORING_VERSION,
  touchlineCoachContractCoversFixture,
  touchlineCoachOutcome,
  touchlineCoachPoints,
} from "../lib/touchlineArena/coach-scoring.ts";

test("keeps the complete owner-approved result-only formula under one version", () => {
  assert.equal(TOUCHLINE_COACH_SCORING_VERSION, "coach_scoring_v2");
  assert.deepEqual(TOUCHLINE_COACH_SCORING.home, { win: 3, draw: 1, loss: -2 });
  assert.deepEqual(TOUCHLINE_COACH_SCORING.away, { win: 6, draw: 3, loss: -1 });
});

test("coach points use the contracted club Home/Away context with no bonuses", () => {
  assert.equal(touchlineCoachPoints("home", "win"), 3);
  assert.equal(touchlineCoachPoints("home", "draw"), 1);
  assert.equal(touchlineCoachPoints("home", "loss"), -2);
  assert.equal(touchlineCoachPoints("away", "win"), 6);
  assert.equal(touchlineCoachPoints("away", "draw"), 3);
  assert.equal(touchlineCoachPoints("away", "loss"), -1);
});

test("Enzo Maresca earns the canonical total for one home win and one away win", () => {
  const manchesterCityVsBournemouth = touchlineCoachPoints("home", "win");
  const crystalPalaceVsManchesterCity = touchlineCoachPoints("away", "win");
  assert.equal(manchesterCityVsBournemouth + crystalPalaceVsManchesterCity, 9);
});

test("the same verified score is evaluated from each contracted club perspective", () => {
  assert.equal(touchlineCoachOutcome("home", 2, 1), "win");
  assert.equal(touchlineCoachOutcome("away", 2, 1), "loss");
  assert.equal(touchlineCoachOutcome("home", 1, 1), "draw");
  assert.equal(touchlineCoachOutcome("away", 1, 1), "draw");
});

test("contract time bounds prevent retroactive and post-cancellation scoring", () => {
  const contract = { startedAt: "2026-08-21T10:00:00Z", endedAt: "2026-08-25T10:00:00Z" };
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-21T09:59:59Z"), false);
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-21T10:00:00Z"), true);
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-25T09:59:59Z"), true);
  assert.equal(touchlineCoachContractCoversFixture(contract, "2026-08-25T10:00:00Z"), false);
});
