import assert from "node:assert/strict";
import test from "node:test";
import { touchLinePlayerFixtureScoreV4 } from "../lib/football-data/player-score-engine-v4.ts";
import { touchLinePlayerFixtureScoreV3 } from "../lib/football-data/player-score-engine-v3.ts";

test("V4 keeps exact provider ratings instead of V3 bands", () => {
  for (const rating of [0, 5.8, 6, 6.5, 7, 7.5, 8, 8.09, 8.5, 9, 9.5, 10]) {
    const result = touchLinePlayerFixtureScoreV4(rating);
    assert.equal(result.scoringVersion, "player_scoring_v4");
    assert.equal(result.rating, rating);
    assert.equal(result.points, rating);
    assert.equal(result.coverageStatus, "complete");
    assert.deepEqual(result.missingFacts, []);
    assert.equal(result.contributions.length, 1);
    assert.equal(result.contributions[0]?.unitPoints, rating);
    assert.equal(result.contributions[0]?.points, rating);
    assert.equal(result.contributions[0]?.factValue, rating);
  }
  assert.equal(touchLinePlayerFixtureScoreV3(8.09).points, 5, "historical V3 semantics remain intact");
  assert.equal(touchLinePlayerFixtureScoreV4("8.09").points, 8.09);
});

test("V4 missing and invalid ratings remain unavailable, not zero", () => {
  for (const value of [null, undefined, "", " ", "invalid", NaN, Infinity, -1, 10.01, {}, true]) {
    const result = touchLinePlayerFixtureScoreV4(value);
    assert.equal(result.rating, null);
    assert.equal(result.points, null);
    assert.equal(result.coverageStatus, "unavailable");
    assert.deepEqual(result.missingFacts, ["sportmonks-rating"]);
    assert.deepEqual(result.contributions, []);
  }
});

test("a corrected provider rating replaces its prior snapshot without accumulating", () => {
  assert.equal(touchLinePlayerFixtureScoreV4(7.11).points, 7.11);
  assert.equal(touchLinePlayerFixtureScoreV4(8.09).points, 8.09);
});
