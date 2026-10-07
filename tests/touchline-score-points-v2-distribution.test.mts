import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isTouchLinePlayerRankingAggregateComplete,
  isTouchLinePlayerRankingSettlementComplete,
} from "../lib/touchlineArena/player-ranking-eligibility.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [store, liveSync, authoritativeRoster, rankingRebuild, rankingPage, tablesPage, tablesClient, coachRanking, backup] = await Promise.all([
  read("lib/football-data/player-season-statistics-store.ts"),
  read("lib/football-data/live-sync.ts"),
  read("lib/touchlineArena/authoritative-roster-server.ts"),
  read("lib/touchlineArena/player-ranking-rebuild-server.ts"),
  read("app/touchline-player-card-rankings/page.tsx"),
  read("app/rankings/page.tsx"),
  read("app/rankings/touchline-tables-client.tsx"),
  read("lib/touchlineArena/coach-ranking-server.ts"),
  read("supabase/qa/016_touchline_qa_score_points_engine_v2_backup.sql"),
]);

test("finished and live fixtures enter the same player settlement pipeline", () => {
  assert.match(store, /isTouchLineSettledFixtureStatus\(status\) \|\| TOUCHLINE_LIVE_FIXTURE_STATUS\.test\(status\)/);
  assert.match(store, /settlementStatus = isTouchLineSettledFixtureStatus\(fixture\.status\) \? "final" as const : "provisional" as const/);
  assert.match(store, /upsert\(batch, \{ onConflict: "football_player_id,competition_id,season_id,scoring_version" \}\)/);
  assert.doesNotMatch(store, /upsert\(batch, \{ onConflict: "football_player_id,fixture_id" \}\)/);
  assert.doesNotMatch(store, /\.from\("football_player_fixture_statistics"\)/);
  assert.match(store, /v3FixtureRowsWritten: 0/);
  assert.match(store, /scoringVersion: "player_scoring_v4"/);
  assert.match(store, /upsert\(batch, \{ onConflict: "football_player_id,fixture_id,scoring_version" \}\)/);
  assert.match(store, /groupTouchLinePlayerSeasonMemberships/);
  assert.match(store, /upsertTouchLineRowsResiliently/);
  assert.match(store, /v4-fixture-backfill-missing/);
  assert.match(liveSync, /syncTouchLinePlayerSeasonStatistics\(admin\)/);
  assert.match(liveSync, /acquireTouchlineLiveSyncRun/);
  assert.ok(liveSync.indexOf("const lease = await") < liveSync.indexOf("syncTouchLinePlayerSeasonStatistics(admin)"));
  assert.match(liveSync, /event: "touchline\.live_sync\.completed"/);
});

test("authoritative roster readers retain canonical Sportmonks ratings and scoring provenance", () => {
  assert.match(authoritativeRoster, /football_player_season_statistics[\s\S]*\.eq\("season_id", currentSeasonId\)[\s\S]*\.eq\("scoring_version", "player_scoring_v4"\)/);
  assert.match(authoritativeRoster, /touchline_player_fixture_score_settlements[\s\S]*\.eq\("season_id", currentSeasonId\)[\s\S]*\.eq\("scoring_version", "player_scoring_v4"\)/);
});

test("active player ranking publishes V4 raw ratings while retaining historical V3 entrypoint", () => {
  assert.match(rankingRebuild, /rebuildTouchLinePlayerRankingV4[\s\S]*scoringVersion: "player_scoring_v4"/);
  assert.match(rankingRebuild, /rebuildTouchLinePlayerRankingV3[\s\S]*scoringVersion: "player_scoring_v3"/);
  assert.match(store, /await rebuildTouchLinePlayerRankingV4\(admin, options\)/);
  assert.match(rankingRebuild, /settlementTable: "touchline_player_fixture_score_settlements"/);
  assert.match(rankingRebuild, /fixtureIds/);
  assert.match(rankingRebuild, /providerPlayerId: String\(player\.providerPlayerId\)[\s\S]*minutesPlayed: player\.minutesPlayed[\s\S]*appearances: player\.appearances/);
  assert.match(rankingRebuild, /loadTouchlinePublishedCardPresentations/);
  assert.match(rankingRebuild, /buildTouchlineSelection/);
  assert.match(rankingRebuild, /isTouchLinePlayerRankingAggregateComplete/);
  assert.match(rankingRebuild, /settlement_status,ranking_coverage_status/);
  assert.match(rankingRebuild, /isTouchLinePlayerRankingSettlementComplete/);
  assert.match(rankingRebuild, /expected_fixture_ids/);
  assert.match(rankingRebuild, /total_score_points/);
  assert.doesNotMatch(rankingRebuild, /touchLinePlayerFixturePoints/);
});

test("player ranking fails closed for partial, duplicate or mismatched fixture coverage", () => {
  assert.equal(isTouchLinePlayerRankingAggregateComplete({
    coverageStatus: "complete",
    expectedFixtureIds: ["fixture-b", "fixture-a"],
    aggregatedFixtureIds: ["fixture-a", "fixture-b"],
  }), true);
  assert.equal(isTouchLinePlayerRankingAggregateComplete({
    coverageStatus: "complete_for_scoring",
    expectedFixtureIds: ["fixture-a", "fixture-b"],
    aggregatedFixtureIds: ["fixture-b", "fixture-a"],
  }), true);
  assert.equal(isTouchLinePlayerRankingAggregateComplete({
    coverageStatus: "partial",
    expectedFixtureIds: ["fixture-a"],
    aggregatedFixtureIds: ["fixture-a"],
  }), false);
  assert.equal(isTouchLinePlayerRankingAggregateComplete({
    coverageStatus: "complete",
    expectedFixtureIds: ["fixture-a", "fixture-b"],
    aggregatedFixtureIds: ["fixture-a"],
  }), false);
  assert.equal(isTouchLinePlayerRankingAggregateComplete({
    coverageStatus: "complete",
    expectedFixtureIds: ["fixture-a", "fixture-a"],
    aggregatedFixtureIds: ["fixture-a"],
  }), false);
});

test("ranking settlement eligibility requires a final fixture and complete scoring", () => {
  assert.equal(isTouchLinePlayerRankingSettlementComplete({ settlementStatus: "final", rankingCoverageStatus: "complete" }), true);
  assert.equal(isTouchLinePlayerRankingSettlementComplete({ settlementStatus: "final", rankingCoverageStatus: "complete_for_scoring" }), true);
  assert.equal(isTouchLinePlayerRankingSettlementComplete({ settlementStatus: "provisional", rankingCoverageStatus: "complete" }), false);
  assert.equal(isTouchLinePlayerRankingSettlementComplete({ settlementStatus: "final", rankingCoverageStatus: "blocking_partial" }), false);
});

test("ranking pages use the league-wide published catalogue, not a private owner roster", () => {
  assert.match(rankingPage, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.doesNotMatch(rankingPage, /readAuthoritativeTouchlineRoster/);
  assert.match(tablesPage, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(tablesPage, /complete\.then\(\(\[, selection, cards\]\) => projectTouchlineRankingsHighlights\(cards, selection\)\)/);
  assert.match(tablesPage, /highlights=\{highlights\}/);
  assert.match(tablesPage, /totalRankedCards=\{rankedCards\.length\}/);
  assert.doesNotMatch(tablesPage, /cardPlayerRank/);
  assert.match(rankingPage, /buildTouchlineVerifiedMatchFactFields/);
  assert.doesNotMatch(rankingPage, /buildTouchlineMatchScoringBreakdownFields/);
});

test("coach ranking stays separate and exposes no owner or contract identity", () => {
  assert.match(coachRanking, /coach_scoring_v2/);
  assert.doesNotMatch(coachRanking, /contractId|user_id|userId/);
  assert.match(coachRanking, /new Set\(coachIds\)\.size !== coachIds\.length/);
  assert.match(tablesPage, /loadTouchLineCoachRanking\(\)/);
  assert.match(tablesClient, /id="coach-rankings"/);
  assert.match(tablesClient, /data-coach-scoring-version/);
});

test("the mandatory pre-image captures score, Arena and contract state before migration", () => {
  assert.match(backup, /touchline_assert_qa_fixture_target\('xgxbwqxjssxxuihuwmgy'\)/);
  for (const table of ["football_player_fixture_statistics", "football_player_season_statistics", "touchline_coach_contracts", "touchline_coach_fixture_points", "touchline_user_arena_state", "touchline_card_contracts", "touchline_card_inventory"]) {
    assert.match(backup, new RegExp(`table public\\.${table}`, "i"));
  }
  assert.match(backup, /revoke all on all tables in schema touchline_qa_backup from public, anon, authenticated/i);
});
