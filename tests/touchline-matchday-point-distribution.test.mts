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

test("canonical fixture points remain distinct from season-card totals and retain verified zero", () => {
  const sourceCards = [card("saka-provider", "saka-canonical"), card("gabriel-provider", "gabriel-canonical"), card("unknown-provider", "unknown-canonical")];
  const withSeasonPoints = applyTouchlineSeasonPoints(sourceCards, [
    { canonicalPlayerId: "saka-canonical", touchlinePoints: 24 },
    { canonicalPlayerId: "gabriel-canonical", touchlinePoints: 8 },
  ]);
  const distributed = applyTouchlineMatchdayPoints(withSeasonPoints, [
    fixtureStatistic({ playerId: "saka-provider", touchlinePoints: 6, statistics: { goals: 1, assists: 1 } }),
    fixtureStatistic({ playerId: "gabriel-provider", touchlinePoints: 0, statistics: { yellowCards: 0, redCards: 0 } }),
  ]);

  assert.equal(distributed[0].seasonTouchlinePoints, 24);
  assert.equal(distributed[0].matchTouchlinePoints, 6);
  assert.deepEqual(distributed[0].matchStats, { goals: 1, assists: 1 });
  assert.equal(squadCardToExactPlayer(distributed[0]).fantasyPoints, 24);
  assert.equal(squadCardToExactPlayer(distributed[0]).matchFantasyPoints, 6);

  assert.equal(distributed[1].seasonTouchlinePoints, 8);
  assert.equal(distributed[1].matchTouchlinePoints, 0, "a provider-confirmed zero remains zero");
  assert.deepEqual(distributed[1].matchStats, { yellowCards: 0, redCards: 0, cards: 0 });

  assert.equal(distributed[2].seasonTouchlinePoints, null, "a missing season fact is unavailable, never a fabricated zero");
  assert.equal(distributed[2].matchTouchlinePoints, undefined);
  assert.equal(squadCardToExactPlayer(distributed[2]).fantasyPoints, null);
});

test("Club Hub receives only allowlisted canonical match and season projections", () => {
  const page = readFileSync(new URL("../app/touchline-clubs/[club]/page.tsx", import.meta.url), "utf8");
  const detailReader = readFileSync(new URL("../lib/football-data/public-fixture-match-detail-server.ts", import.meta.url), "utf8");
  const seasonReader = readFileSync(new URL("../lib/touchlineArena/public-season-player-points-server.ts", import.meta.url), "utf8");
  const authoritativeRoster = readFileSync(new URL("../lib/touchlineArena/authoritative-roster-server.ts", import.meta.url), "utf8");
  const authoritativeArena = readFileSync(new URL("../lib/touchlineArena/authoritative-arena-state.ts", import.meta.url), "utf8");
  const lineup = readFileSync(new URL("../components/touchline/ClubHubOfficialLineup.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("../components/touchline/ClubHubSquadGrid.tsx", import.meta.url), "utf8");
  const exactCard = readFileSync(new URL("../components/touchline/cards/TouchlineEliteExactCard.tsx", import.meta.url), "utf8");

  assert.match(page, /readPublicFantasyFixtureMatchDetail/);
  assert.match(page, /readPublicSeasonPlayerPoints/);
  assert.match(page, /applyTouchlineSeasonPoints/);
  assert.match(page, /applyTouchlineMatchdayPoints/);
  assert.match(detailReader, /statistics_payload/);
  assert.match(detailReader, /function cardStatistics/);
  assert.match(seasonReader, /select\("football_player_id,summary_payload"\)/);
  assert.match(seasonReader, /provider_competition_id/);
  assert.match(seasonReader, /\.eq\("is_current", true\)/);
  assert.doesNotMatch(seasonReader, /\.from\("(?:touchline_card_contracts|touchline_wallet|profiles)"\)/);
  assert.match(lineup, /showMatchPoints/);
  assert.match(grid, /showMatchPoints/);
  assert.match(lineup, /Current match points/);
  assert.match(grid, /Current match points/);
  assert.match(exactCard, /player\.fantasyPoints === undefined/);
  assert.match(exactCard, /const preseasonMissingValue = "—"/);
  assert.match(authoritativeRoster, /seasonTouchlinePoints/);
  assert.match(authoritativeRoster, /summary\?\.touchlinePoints/);
  assert.match(authoritativeRoster, /return null;/);
  assert.match(authoritativeArena, /rosterCard\.seasonTouchlinePoints/);
});
