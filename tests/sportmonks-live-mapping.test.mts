import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SPORTMONKS_INPLAY_LIVESCORES_PATH,
  SPORTMONKS_LATEST_LIVESCORES_PATH,
  classifySportmonksLineupRole,
  mergeTouchlineLiveFixtureDeltas,
  selectSportmonksParticipantScore,
} from "../lib/football-data/sportmonks-live.ts";

const providerSource = readFileSync(
  new URL("../lib/football-data/providers/sportmonks.ts", import.meta.url),
  "utf8",
);

test("Sportmonks lineup type_id 11 and 12 override conflicting text", () => {
  assert.deepEqual(
    classifySportmonksLineupRole({ type_id: 11, lineup_type: "bench" }),
    { isStarter: true, isSubstitute: false },
  );
  assert.deepEqual(
    classifySportmonksLineupRole({ type_id: "12", lineup_type: "starting lineup" }),
    { isStarter: false, isSubstitute: true },
  );
  assert.match(providerSource, /classifySportmonksLineupRole\(item\)/);
});

test("Sportmonks lineup text remains a compatibility fallback when type_id is absent", () => {
  assert.deepEqual(
    classifySportmonksLineupRole({ lineup_type: "Reserve" }),
    { isStarter: false, isSubstitute: true },
  );
  assert.deepEqual(
    classifySportmonksLineupRole({ lineup_type: "Starter" }),
    { isStarter: true, isSubstitute: false },
  );
});

test("selects each participant CURRENT score instead of the first period score", () => {
  const scores = [
    { id: 1, description: "1ST_HALF", score: { participant: "home", goals: 1 } },
    { id: 2, description: "2ND_HALF_ONLY", score: { participant: "away", goals: 1 } },
    { id: 3, description: "CURRENT", score: { participant: "away", goals: 2 } },
    { id: 4, description: "2ND_HALF", score: { participant: "home", goals: 2 } },
    { id: 5, description: "CURRENT", score: { participant: "home", goals: 3 } },
  ];

  assert.equal(selectSportmonksParticipantScore(scores, "home"), 3);
  assert.equal(selectSportmonksParticipantScore(scores, "away"), 2);
  assert.match(providerSource, /return selectSportmonksParticipantScore\(scores, location\)/);
});

test("score fallback is deterministic when CURRENT is temporarily absent", () => {
  const scores = [
    { id: 30, description: "1ST_HALF", score: { participant: "home", goals: 1 } },
    { id: 10, description: "2ND_HALF_ONLY", score: { participant: "home", goals: 2 } },
    { id: 20, description: "2ND_HALF", score: { participant: "home", goals: 3 } },
  ];

  assert.equal(selectSportmonksParticipantScore(scores, "home"), 3);
  assert.equal(selectSportmonksParticipantScore([...scores].reverse(), "home"), 3);
  assert.equal(selectSportmonksParticipantScore(scores, "away"), undefined);
});

test("Live supports an inplay bootstrap and a latest-update delta", () => {
  assert.equal(SPORTMONKS_INPLAY_LIVESCORES_PATH, "/livescores/inplay");
  assert.equal(SPORTMONKS_LATEST_LIVESCORES_PATH, "/livescores/latest");
  assert.match(providerSource, /getLatestLiveScores/);
});

test("latest deltas update one match without deleting the coherent league snapshot", () => {
  const fixture = (providerId: string, homeScore: number) => ({
    id: `sportmonks:${providerId}`,
    providerId,
    provider: "sportmonks" as const,
    homeScore,
    source: { provider: "sportmonks" as const, providerId },
  });
  const merged = mergeTouchlineLiveFixtureDeltas(
    [fixture("1", 0), fixture("2", 1)],
    [fixture("2", 2)],
  );
  assert.deepEqual(merged.map((item) => [item.providerId, item.homeScore]), [
    ["1", 0],
    ["2", 2],
  ]);
});
