import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTouchLinePlayerRankingCoverage,
  isTouchLinePlayerRankingCoverageComplete,
} from "../lib/football-data/player-ranking-coverage.ts";

test("final settlements distinguish complete detail from complete-for-scoring", () => {
  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: 6,
    scoringCoverageStatus: "complete",
    missingFacts: [],
    appearanceStatus: "started",
  }), "complete");

  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: 6,
    scoringCoverageStatus: "partial",
    missingFacts: ["rating", "shots-off-target", "def:clearances"],
    appearanceStatus: "started",
  }), "blocking_partial");
});

test("complete-for-scoring is limited to non-scoring or not-applicable facts", () => {
  const missingFacts = ["shots-on-target", "shots-off-target", "saves"] as const;
  const status = classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: 0,
    scoringCoverageStatus: "partial",
    missingFacts,
    appearanceStatus: "unused",
  });

  assert.equal(status, "complete_for_scoring");
  assert.deepEqual(missingFacts, ["shots-on-target", "shots-off-target", "saves"]);
  assert.equal(isTouchLinePlayerRankingCoverageComplete(status), true);

  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: 0,
    scoringCoverageStatus: "partial",
    missingFacts: ["shots-off-target"],
    appearanceStatus: "started",
  }), "complete_for_scoring");
});

test("unknown missing facts, live settlements and unavailable scores fail closed", () => {
  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: 0,
    scoringCoverageStatus: "partial",
    missingFacts: ["team-goals-conceded"],
    appearanceStatus: "started",
  }), "blocking_partial");
  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: false,
    points: 9,
    scoringCoverageStatus: "complete",
    missingFacts: [],
    appearanceStatus: "started",
  }), "blocking_partial");
  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: null,
    scoringCoverageStatus: "unavailable",
    missingFacts: ["canonical-events"],
    appearanceStatus: "unavailable",
  }), "unavailable");
});

test("active scoring facts remain blocking when a participant lacks provider confirmation", () => {
  for (const fact of [
    "shots-on-target",
    "rating",
    "saves",
    "goals-conceded-while-on-field",
    "def:tacklesWon",
    "def:interceptions",
    "def:clearances",
    "def:blockedShots",
    "def:aerialsWon",
  ]) {
    assert.equal(classifyTouchLinePlayerRankingCoverage({
      fixtureFinal: true,
      points: 0,
      scoringCoverageStatus: "partial",
      missingFacts: [fact],
      appearanceStatus: "started",
    }), "blocking_partial", fact);
  }
});

test("a provider-confirmed participant without a Sportmonks rating is excluded, never assigned zero", () => {
  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: null,
    scoringCoverageStatus: "unavailable",
    missingFacts: ["sportmonks-rating"],
    appearanceStatus: "substitute",
    providerRatingAbsentFromFinalLineup: true,
  }), "complete_for_scoring");

  assert.equal(classifyTouchLinePlayerRankingCoverage({
    fixtureFinal: true,
    points: null,
    scoringCoverageStatus: "unavailable",
    missingFacts: ["sportmonks-rating"],
    appearanceStatus: "substitute",
  }), "unavailable");
});
