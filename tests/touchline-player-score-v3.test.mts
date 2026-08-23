import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TOUCHLINE_PLAYER_SCORING_V3_VERSION,
  touchLinePlayerFixtureScoreV3,
  touchLinePointsFromSportmonksRating,
} from "../lib/football-data/player-score-engine-v3.ts";

test("player_scoring_v3 has the approved Sportmonks rating boundaries", () => {
  const cases = [
    [5.8, -1], [6.0, 0], [6.4, 0], [6.5, 1], [6.9, 1],
    [7.0, 2], [7.4, 2], [7.5, 3], [7.9, 3], [8.0, 5],
    [8.4, 5], [8.5, 7], [8.9, 7], [9.0, 9], [9.4, 9],
    [9.5, 12], [10.0, 12],
  ] as const;
  assert.equal(TOUCHLINE_PLAYER_SCORING_V3_VERSION, "player_scoring_v3");
  for (const [rating, points] of cases) assert.equal(touchLinePointsFromSportmonksRating(rating), points);
});

test("V3 has one current rating result, never an accumulated live snapshot", () => {
  const first = touchLinePlayerFixtureScoreV3(7.2);
  const current = touchLinePlayerFixtureScoreV3(8.1);
  assert.equal(first.points, 2);
  assert.equal(current.points, 5);
  assert.equal(current.contributions[0]?.points, 5);
});

test("missing rating stays unavailable and never becomes zero", () => {
  const missing = touchLinePlayerFixtureScoreV3(null);
  assert.equal(missing.points, null);
  assert.equal(missing.coverageStatus, "unavailable");
  assert.deepEqual(missing.missingFacts, ["sportmonks-rating"]);
});

test("the protected V3 rebuild route refuses every runtime outside dedicated QA", () => {
  const route = readFileSync(new URL("../app/api/football-data/player-season-statistics/sync/route.ts", import.meta.url), "utf8");
  assert.match(route, /inspectTouchlineIsolatedPreviewEnvironment\(\)\.status === "qa"/);
  assert.match(route, /TOUCHLINE_QA_SUPABASE_PROJECT_REF === QA_PROJECT_REF/);
  assert.match(route, /Score Engine V3 rebuild is available only in dedicated QA/);
});
