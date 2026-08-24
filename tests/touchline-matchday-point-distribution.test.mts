import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TouchlinePublicFixturePlayerStatistics } from "../lib/football-data/public-fantasy-fixture.ts";
import {
  applyTouchlineMatchdayPoints,
  applyTouchlineSeasonPoints,
} from "../lib/touchlineArena/matchday-player-points.ts";
import { squadCardToExactPlayer, type ClubOwnerSquadCard } from "../lib/touchlineArena/demo-data.ts";

function card(id: string, canonicalPlayerId: string): ClubOwnerSquadCard {
  return {
    id,
    canonicalPlayerId,
    name: `Player ${id}`,
    shortName: `P${id}`,
    role: "midfielder",
    position: "CM",
    clubName: "Arsenal FC",
    shirtNumber: 8,
    countryCode3: "ENG",
    marketValue: "",
    touchlinePoints: 0,
  };
}

function fixtureStatistic(input: Partial<TouchlinePublicFixturePlayerStatistics> & Pick<TouchlinePublicFixturePlayerStatistics, "playerId">): TouchlinePublicFixturePlayerStatistics {
  return {
    playerName: `Player ${input.playerId}`,
    appearanceStatus: "started",
    minutes: 90,
    rating: null,
    touchlinePoints: null,
    settlementStatus: "final",
    contributions: [],
    statistics: {},
    ...input,
  };
}

test("legacy fixture score data remains technical and never becomes an active card metric", () => {
  const sourceCards = [card("saka-provider", "saka-canonical"), card("gabriel-provider", "gabriel-canonical"), card("unknown-provider", "unknown-canonical")];
  const withSeasonPoints = applyTouchlineSeasonPoints(sourceCards, [
    { canonicalPlayerId: "saka-canonical", touchlinePoints: 24, totalRating: 15.43, statistics: { goals: 1, assists: 0, yellowCards: 0, redCards: 0 } },
    { canonicalPlayerId: "gabriel-canonical", touchlinePoints: 8, totalRating: 7.18, statistics: { goals: 0, assists: 0, yellowCards: 1, redCards: 0 } },
  ]);
  const distributed = applyTouchlineMatchdayPoints(withSeasonPoints, [
    fixtureStatistic({ playerId: "saka-provider", touchlinePoints: 6, contributions: [{ providerEventId: "goal-1", role: "primary", eventType: "Goal", minute: 67, points: 6 }], statistics: { goals: 1, assists: 0, yellowCards: 0, redCards: 0 } }),
    fixtureStatistic({ playerId: "gabriel-provider", touchlinePoints: 0, statistics: { yellowCards: 0, redCards: 0 } }),
  ]);

  assert.equal(distributed[0].seasonTouchlinePoints, 24);
  assert.equal(distributed[0].matchTouchlinePoints, 6);
  assert.deepEqual(distributed[0].seasonStats, { goals: 1, assists: 0, yellowCards: 0, redCards: 0 });
  assert.deepEqual(distributed[0].matchStats, { goals: 1, assists: 0, yellowCards: 0, redCards: 0, rating: null, cards: 0 });
  assert.deepEqual(distributed[0].matchPointContributions, [{ role: "primary", eventType: "Goal", minute: 67, points: 6 }]);
  assert.equal(squadCardToExactPlayer(distributed[0]).totalRating, 15.43);
  assert.equal(squadCardToExactPlayer(distributed[0]).matchRating, null);

  assert.equal(distributed[1].seasonTouchlinePoints, 8);
  assert.equal(distributed[1].seasonTotalRating, 7.18);
  assert.equal(distributed[1].matchTouchlinePoints, 0, "a provider-confirmed zero remains zero");
  assert.deepEqual(distributed[1].matchStats, { yellowCards: 0, redCards: 0, rating: null, cards: 0 });

  assert.equal(distributed[2].seasonTouchlinePoints, null, "a missing season fact is unavailable, never a fabricated zero");
  assert.equal(distributed[2].matchTouchlinePoints, undefined);
  assert.equal(squadCardToExactPlayer(distributed[2]).totalRating, null);
});

test("Club Hub receives only allowlisted canonical match and season projections", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const detailReader = readFileSync(new URL("../lib/football-data/public-fixture-match-detail-server.ts", import.meta.url), "utf8");
  const seasonReader = readFileSync(new URL("../lib/touchlineArena/public-season-player-points-server.ts", import.meta.url), "utf8");
  const authoritativeRoster = readFileSync(new URL("../lib/touchlineArena/authoritative-roster-server.ts", import.meta.url), "utf8");
  const authoritativeArena = readFileSync(new URL("../lib/touchlineArena/authoritative-arena-state.ts", import.meta.url), "utf8");
  const playerProfile = readFileSync(new URL("../app/touchline-players/[player]/page.tsx", import.meta.url), "utf8");
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  const exactCard = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

  assert.match(page, /readPublicFantasyFixtureMatchDetail/);
  assert.match(page, /readPublicSeasonPlayerPoints/);
  assert.match(page, /applyTouchlineSeasonPoints/);
  assert.match(page, /applyTouchlineMatchdayPoints/);
  assert.match(page, /selectPublicClubScoringFixture/);
  assert.match(playerProfile, /seasonCleanSheets/);
  assert.match(playerProfile, /seasonSaves/);
  assert.match(detailReader, /statistics_payload/);
  assert.match(detailReader, /function cardStatistics/);
  assert.match(seasonReader, /select\("football_player_id,summary_payload,position_statistics_payload"\)/);
  assert.match(seasonReader, /const totalRating = finiteNumber\(summary\?\.totalRating\)/);
  assert.match(seasonReader, /loadTouchLineActiveRanking/);
  assert.match(seasonReader, /rankingTotalRatingByPlayerId/);
  assert.match(seasonReader, /rankingOnlyProjection/);
  assert.match(seasonReader, /if \(seasonsError \|\| seasonIds\.length !== 1\) return rankingOnlyProjection\(\)/);
  assert.match(seasonReader, /\{ canonicalPlayerId, touchlinePoints, totalRating, statistics \}/);
  assert.match(seasonReader, /provider_competition_id/);
  assert.match(seasonReader, /\.eq\("is_current", true\)/);
  assert.doesNotMatch(seasonReader, /\.from\("(?:touchline_card_contracts|touchline_wallet|profiles)"\)/);
  assert.match(lineup, /showMatchRating/);
  assert.match(grid, /showMatchRating/);
  assert.match(grid, /seasonTotalRating/);
  assert.match(lineup, /buildTouchlineVerifiedMatchFactFields/);
  assert.match(grid, /buildTouchlineVerifiedMatchFactFields/);
  assert.match(exactCard, /player\.totalRating === undefined/);
  assert.match(exactCard, /const preseasonMissingValue = "—"/);
  assert.match(authoritativeRoster, /seasonTotalRating/);
  assert.doesNotMatch(authoritativeRoster, /summary\?\.touchlinePoints/);
  assert.match(authoritativeRoster, /return null;/);
  assert.match(authoritativeArena, /rosterCard\.seasonTotalRating/);
  assert.match(exactCard, /GOL=goals, AST=assists/);
});
