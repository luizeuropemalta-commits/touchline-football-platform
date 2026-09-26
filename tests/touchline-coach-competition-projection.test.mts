import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { coachCompetitionFromRanking } from "../lib/touchlineArena/coach-competition-projection.ts";
import type { TouchLineCoachRankingState } from "../lib/touchlineArena/coach-ranking-server.ts";

const ranking: TouchLineCoachRankingState = {
  phase: "ranked", snapshotId: "verified-snapshot", seasonId: "verified-season", scoringVersion: "coach_scoring_v2",
  fixtureIds: ["fixture-1", "fixture-2"], generatedAt: null,
  rows: [{ rank: 1, coachProviderId: "307", coachName: "Mikel Arteta", clubName: "Arsenal", touchlinePoints: 2,
    wins: 1, draws: 0, losses: 1, awayWins: 0,
    home: { wins: 1, draws: 0, losses: 0, touchlinePoints: 3 },
    away: { wins: 0, draws: 0, losses: 1, touchlinePoints: -1 } }],
};
test("competition presentation preserves the canonical row, including negative away points", () => {
  assert.deepEqual(coachCompetitionFromRanking(ranking, "307", "2026-27"), {
    snapshotId: "verified-snapshot", seasonId: "verified-season", scoringVersion: "coach_scoring_v2", seasonLabel: "2026-27",
    rank: 1, totalTouchlinePoints: 2, home: ranking.rows[0].home, away: ranking.rows[0].away,
  });
});
test("unknown coaches and incomplete snapshot identity never receive borrowed totals", () => {
  assert.equal(coachCompetitionFromRanking(ranking, "999"), null);
  for (const incomplete of [{ phase: "unavailable" as const }, { snapshotId: null }, { seasonId: null }, { scoringVersion: null }]) {
    assert.equal(coachCompetitionFromRanking({ ...ranking, ...incomplete }, "307"), null);
  }
});
test("zero is retained and an unknown season label is not invented", () => {
  const result = coachCompetitionFromRanking({ ...ranking, rows: [{ ...ranking.rows[0], touchlinePoints: 0 }] }, "307");
  assert.equal(result?.totalTouchlinePoints, 0);
  assert.equal(result?.seasonLabel, "");
});
test("gallery and profile both use canonical projection and pass it to their cards", () => {
  const gallery = readFileSync(new URL("../components/touchline/TouchlineCoachCategoryShowcase.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../app/touchline-coaches/[coach]/page.tsx", import.meta.url), "utf8");
  assert.match(gallery, /coachCompetitionFromRanking\(/);
  assert.match(gallery, /competition=\{competition\}/);
  assert.match(gallery, /publishedTouchlinePoints=\{competition\?\.totalTouchlinePoints \?\? null\}/);
  assert.match(gallery, /showLeadershipCrown=\{competition\?\.rank === 1\}/);
  assert.match(profile, /coachCompetitionFromRanking\(/);
});
