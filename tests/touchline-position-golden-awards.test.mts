import assert from "node:assert/strict";
import test from "node:test";
import { buildTouchlineRankingSnapshot, type TouchlineRankingPlayerInput } from "../lib/touchlineArena/card-ranking.ts";
import { TOUCHLINE_ENGLAND_LEAGUE_KEY, TOUCHLINE_PRESEASON_RANKING_STATE, type TouchlineActiveRankingState } from "../lib/touchlineArena/card-ranking-live.ts";
import { TOUCHLINE_CARD_PRICE_TABLE_VERSION } from "../lib/touchlineArena/card-rules.ts";
import { touchlinePositionGoldenAward } from "../lib/touchlineArena/position-golden-awards.ts";
const POSITION_GROUP_SIZES = [64, 110, 90, 120, 100, 100] as const;
const POSITION_CODES = ["GK", "CB", "RB", "CM", "RW", "ST"] as const;


function buildFullLeaguePlayers(): TouchlineRankingPlayerInput[] {
  let providerPlayerId = 10_000;
  return POSITION_GROUP_SIZES.flatMap((groupSize, groupIndex) => (
    Array.from({ length: groupSize }, (_, index) => {
      providerPlayerId += 1;
      return {
        playerId: `player-${providerPlayerId}`,
        providerPlayerId,
        name: `Player ${providerPlayerId}`,
        clubName: `Club ${(providerPlayerId % 20) + 1}`,
        position: POSITION_CODES[groupIndex],
        totalRating: groupSize - index,
        minutesPlayed: 900 - index,
        appearances: 10,
      };
    })
  ));
}

function activeState(): TouchlineActiveRankingState {
  const snapshot = buildTouchlineRankingSnapshot({
    snapshotId: "england-round-01-v1",
    roundId: "round-01",
    status: "published",
    generatedAt: "2026-08-15T18:00:00.000Z",
    source: "sportmonks-audited",
    players: buildFullLeaguePlayers(),
  });

  const totalScorePoints = 0;
  return {
    phase: "ranked",
    leagueKey: TOUCHLINE_ENGLAND_LEAGUE_KEY,
    snapshotId: snapshot.snapshotId,
    roundId: snapshot.roundId,
    publishedAt: "2026-08-15T18:05:00.000Z",
    priceTableVersion: TOUCHLINE_CARD_PRICE_TABLE_VERSION,
    scoringVersion: "player_scoring_v3",
    coverageStatus: "complete_for_scoring",
    seasonId: "season-1",
    fixtureIds: ["fixture-1"],
    expectedFixtureIds: ["fixture-1"],
    totalScorePoints,
    players: snapshot.players,
  };
}


test("awards follow total ratings for goalkeeper and centre-back only", () => {
 const state=activeState();
 for (const [group,key] of [["goalkeeper","golden-gloves"],["centre-back","golden-shield"]]) {
 const players=state.players.filter(p=>p.positionGroup===group);
 assert.equal(touchlinePositionGoldenAward(state,players[0].playerId)?.key,key);
 assert.equal(touchlinePositionGoldenAward(state,players[1].playerId),null);
 const changed={...state,players:state.players.map(p=>p.playerId===players[1].playerId ? {...p,totalRating:9999}:p)};
 assert.equal(touchlinePositionGoldenAward(changed,players[0].playerId),null);
 assert.equal(touchlinePositionGoldenAward(changed,players[1].playerId)?.key,key);
 }
 assert.equal(touchlinePositionGoldenAward(state,state.players.find(p=>p.positionGroup==="full-back")!.playerId),null);
});
test("missing publication, missing players and preseason never receive awards",()=>{
 assert.equal(touchlinePositionGoldenAward(null,"missing"),null);
 assert.equal(touchlinePositionGoldenAward(TOUCHLINE_PRESEASON_RANKING_STATE,"missing"),null);
 const state=activeState();
 assert.equal(touchlinePositionGoldenAward({...state,snapshotId:null},state.players[0].playerId),null);
 assert.equal(touchlinePositionGoldenAward(state,"missing"),null);
});
test("ties use ranking minutes and withhold an award when tie evidence is absent",()=>{
 const state=activeState(); const [a,b]=state.players.filter(p=>p.positionGroup==="goalkeeper");
 const tied={...state,players:state.players.map(p=>p.playerId===b.playerId ? {...p,totalRating:a.totalRating,minutesPlayed:9999}:p)};
 assert.equal(touchlinePositionGoldenAward(tied,b.playerId)?.key,"golden-gloves");
 const missing={...tied,players:tied.players.map(p=>p.playerId===a.playerId?{...p,minutesPlayed:undefined}:p)};
 assert.equal(touchlinePositionGoldenAward(missing,b.playerId),null);
});
