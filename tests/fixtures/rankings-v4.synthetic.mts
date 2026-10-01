import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { RankingsLiveEvidence } from "../../lib/social-rankings-live-contract.ts";

/** Test-only V4 projection of archived raw facts. Not a new capture, approval,
 * migration or publication. Historical artifacts remain byte-for-byte intact. */
export function syntheticRankingsV4Evidence(): RankingsLiveEvidence {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../../artifacts/social-studio/rankings/${name}`, import.meta.url), "utf8"));
  const evidence = read("settlement-evidence-20260914.json") as RankingsLiveEvidence;
  evidence.ratingFeeds = read("rating-lineup-evidence-20260914.json").feeds;
  for (const row of evidence.settlements) {
    assert.equal(row.scoring_version, "player_scoring_v3", "fixture must remain explicitly historical");
    const player = evidence.players.find(player => player.id === row.football_player_id);
    assert.ok(player);
    const feed = evidence.ratingFeeds.find(feed => feed.fixtureId === row.fixture_id);
    assert.ok(feed);
    const members = feed.lineups.filter(member => member.playerId === player.provider_player_id);
    assert.ok(members.length <= 1);
    const stat = (code: string) => {
      const value = members[0]?.statistics.find(stat => stat.code === code)?.value;
      return value === undefined || value === null ? null : Number(value);
    };
    const rating = stat("rating");
    const minutes = stat("minutes-played") ?? stat("minutes");
    assert.equal(rating, row.rating, "archived settlement must agree with canonical raw rating");
    assert.equal(minutes, row.minutes_played);
    assert.ok(rating === null || Number.isFinite(rating) && rating >= 0 && rating <= 10);
    const participant = ["started", "substitute"].includes(row.appearance_status) && minutes !== null && minutes > 0;
    Object.assign(row, { scoring_version: "player_scoring_v4", touchline_points: participant ? rating : null,
      scoring_coverage_status: participant && rating !== null ? "complete" : "unavailable",
      touchline_points_breakdown: participant && rating !== null ? [{ providerEventId: `rating:${rating}`, ruleCode: "sportmonks-rating", factValue: rating, points: rating }] : [] });
  }
  return evidence;
}
