import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isTouchLinePlayerRankingAggregateComplete } from "../lib/touchlineArena/player-ranking-eligibility.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [store, liveSync, arena, accountSync, authoritativeRoster, clubOwner, marketStage, rankingRebuild, rankingPage, tablesPage, tablesClient, coachRanking, backup] = await Promise.all([
  read("lib/football-data/player-season-statistics-store.ts"),
  read("lib/football-data/live-sync.ts"),
  read("app/arena/ArenaClient.tsx"),
  read("lib/touchlineArena/arena-account-sync.ts"),
  read("lib/touchlineArena/authoritative-roster-server.ts"),
  read("components/touchline/club-owner/ClubOwnerProfileRenderer.tsx"),
  read("components/touchline/market/TouchlineSquadBuilderStage.tsx"),
  read("lib/touchlineArena/player-ranking-rebuild-server.ts"),
  read("app/touchline-player-card-rankings/page.tsx"),
  read("app/touchline-tables/page.tsx"),
  read("app/touchline-tables/touchline-tables-client.tsx"),
  read("lib/touchlineArena/coach-ranking-server.ts"),
  read("supabase/qa/016_touchline_qa_score_points_engine_v2_backup.sql"),
]);

test("finished and live fixtures enter the same player settlement pipeline", () => {
  assert.match(store, /isTouchLineSettledFixtureStatus\(status\) \|\| TOUCHLINE_LIVE_FIXTURE_STATUS\.test\(status\)/);
  assert.match(store, /settlementStatus = isTouchLineSettledFixtureStatus\(fixture\.status\) \? "final" : "provisional"/);
  assert.match(liveSync, /syncTouchLinePlayerSeasonStatistics\(admin\)/);
});

test("Arena refreshes canonical match points without persisting a scoring cache", () => {
  assert.match(accountSync, /fantasyPoints: rosterCard\.seasonTouchlinePoints \?\? rosterCard\.touchlinePoints/);
  assert.match(accountSync, /matchFantasyPoints: rosterCard\.matchTouchlinePoints \?\? null/);
  assert.match(arena, /refreshAuthoritativeScoring/);
  assert.match(arena, /setInterval\(\(\) => void refreshAuthoritativeScoring\(\), 45_000\)/);
  assert.match(arena, /fantasyPoints: undefined[\s\S]*matchFantasyPoints: undefined[\s\S]*matchPointContributions: undefined/);
  assert.match(authoritativeRoster, /football_player_season_statistics[\s\S]*\.eq\("season_id", currentSeasonId\)[\s\S]*\.eq\("scoring_version", "player_scoring_v2"\)/);
  assert.match(authoritativeRoster, /football_player_fixture_statistics[\s\S]*\.eq\("season_id", currentSeasonId\)[\s\S]*\.eq\("scoring_version", "player_scoring_v2"\)/);
});

test("player ranking publishes only V2 season aggregates with full traceability", () => {
  assert.match(rankingRebuild, /eq\("scoring_version", "player_scoring_v2"\)/);
  assert.match(rankingRebuild, /scoringVersion: "player_scoring_v2"/);
  assert.match(rankingRebuild, /fixtureIds/);
  assert.match(rankingRebuild, /providerPlayerId: String\(player\.providerPlayerId\)[\s\S]*minutesPlayed: player\.minutesPlayed[\s\S]*appearances: player\.appearances/);
  assert.match(rankingRebuild, /loadTouchlinePublishedCardPresentations/);
  assert.match(rankingRebuild, /buildTouchlineSelection/);
  assert.match(rankingRebuild, /isTouchLinePlayerRankingAggregateComplete/);
  assert.doesNotMatch(rankingRebuild, /touchLinePlayerFixturePoints/);
});

test("player ranking fails closed for partial, duplicate or mismatched fixture coverage", () => {
  assert.equal(isTouchLinePlayerRankingAggregateComplete({
    coverageStatus: "complete",
    expectedFixtureIds: ["fixture-b", "fixture-a"],
    aggregatedFixtureIds: ["fixture-a", "fixture-b"],
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

test("ranking pages use the league-wide published catalogue, not a private owner roster", () => {
  assert.match(rankingPage, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.doesNotMatch(rankingPage, /readAuthoritativeTouchlineRoster/);
  assert.match(tablesPage, /loadTouchLineRankedCardCatalog\(activeRanking\)/);
  assert.match(tablesPage, /cardPlayerRank = \[\.\.\.rankedCards\]\.sort\(compareTouchLineRankedCards\)/);
  for (const surface of [rankingPage, clubOwner, marketStage]) {
    assert.match(surface, /buildTouchlineVerifiedMatchFactFields/);
    assert.match(surface, /buildTouchlineMatchScoringBreakdownFields/);
  }
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
