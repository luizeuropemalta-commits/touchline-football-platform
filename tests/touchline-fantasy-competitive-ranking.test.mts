import assert from "node:assert/strict";
import test from "node:test";
import { readProductionRankings } from "./helpers/fantasy-ranking-projection.mts";

test("actual ranking readers include paid points only, even after a Beta user upgrades", async () => {
  const gameweeks = [
    {id:"practice",user_id:"upgraded",gameweek_id:"current",season_id:"season",market_plan_key_snapshot:"beta"},
    {id:"paid",user_id:"upgraded",gameweek_id:"current",season_id:"season",market_plan_key_snapshot:"standard"},
    {id:"vip",user_id:"vip-user",gameweek_id:"current",season_id:"season",market_plan_key_snapshot:"vip"},
    {id:"unknown",user_id:"unknown-user",gameweek_id:"current",season_id:"season",market_plan_key_snapshot:null},
  ];
  const scores = gameweeks.map(row=>({user_gameweek_id:row.id,gameweek_score:row.id === "paid" ? 15 : row.id === "vip" ? 20 : 999,settlement_status:"FINAL"}));
  const result = await readProductionRankings({
    touchline_fantasy_user_gameweeks: gameweeks,
    touchline_fantasy_user_gameweek_scores: scores,
    users: [{id:"upgraded",full_name:"Upgraded"},{id:"vip-user",full_name:"VIP"},{id:"unknown-user",full_name:"Unknown"}],
  }, "current", "season", "upgraded");
  for (const ranking of [result.gameweek,result.season]) {
    assert.deepEqual(JSON.parse(JSON.stringify(ranking)),[
      {rank:1,name:"VIP",score:20,isCurrentManager:false},
      {rank:2,name:"Upgraded",score:15,isCurrentManager:true},
    ]);
    assert.doesNotMatch(JSON.stringify(ranking), /userId|user_id|vip-user/);
  }
});


const populatedRound = (count: number, previous = 0) => {
  const touchline_fantasy_user_gameweeks = Array.from({length:previous + count}, (_, index) => ({
    id: `round-${String(index).padStart(6,"0")}`, user_id:`private-${index}`, season_id:"season", gameweek_id:index < previous ? "previous" : "current", market_plan_key_snapshot:"standard",
  }));
  return {touchline_fantasy_user_gameweeks,
    touchline_fantasy_user_gameweek_scores:touchline_fantasy_user_gameweeks.map((row,index)=>({user_gameweek_id:row.id,gameweek_score:index+1,settlement_status:"FINAL"})),
    users:touchline_fantasy_user_gameweeks.map(row=>({id:row.user_id,full_name:row.user_id.replace("private-","Manager ")})),
  };
};

test("a current entrant after 1000 previous-round rows is not lost to PostgREST limits", async () => {
  const data = populatedRound(1,1000);
  const result = await readProductionRankings(data,"current","season","private-1000");
  assert.deepEqual(JSON.parse(JSON.stringify(result.gameweek)),[{rank:1,name:"Manager 1000",score:1001,isCurrentManager:true}]);
  assert.equal(result.season.find(row=>row.isCurrentManager)?.score,1001);
});

test("round pagination retains all 1201 participants, scores and names without leaking private IDs", async () => {
  const data = populatedRound(1201);
  const result = await readProductionRankings(data,"current","season","private-1200");
  assert.equal(result.gameweek.length,1201);
  assert.equal(result.gameweek[0].name,"Manager 1200");
  assert.equal(result.gameweek[0].score,1201);
  assert.equal(result.gameweek[0].isCurrentManager,true);
  assert.equal(result.gameweek.at(-1)?.score,1);
  assert.doesNotMatch(JSON.stringify(result.gameweek), /private-|userId|user_id/);
});

for (const roundPageFault of ["truncated","count-drift","error","duplicate"] as const) {
  test(`round ${roundPageFault} never publishes a partial classification`, async () => {
    const result = await readProductionRankings(populatedRound(1201),"current","season","private-1200",{roundPageFault});
    assert.equal(result.gameweek.length,0);
    assert.equal(result.season.length,1201,"independent season remains complete");
  });
}

test("round ties preserve the existing deterministic ordering and current-manager identity", async () => {
  const data = populatedRound(2);
  data.touchline_fantasy_user_gameweek_scores.forEach(row=>row.gameweek_score=10);
  data.users.forEach(row=>row.full_name="Same name");
  const result = await readProductionRankings(data,"current","season","private-1");
  assert.deepEqual(JSON.parse(JSON.stringify(result.gameweek)),[
    {rank:1,name:"Same name",score:10,isCurrentManager:false},
    {rank:2,name:"Same name",score:10,isCurrentManager:true},
  ]);
  assert.deepEqual(result.season.map(row=>row.rank),[1,1],"season retains its own shared-tie rule");
});

test("invalid score or missing joined identity never becomes a misleading zero in the round", async () => {
  const invalidScore = populatedRound(1);
  invalidScore.touchline_fantasy_user_gameweek_scores[0].gameweek_score=NaN;
  const missingNameRow = populatedRound(1); missingNameRow.users=[];
  for (const data of [invalidScore,missingNameRow]) {
    assert.equal((await readProductionRankings(data,"current","season","private-0")).gameweek.length,0);
  }
  const zero = populatedRound(1); zero.touchline_fantasy_user_gameweek_scores[0].gameweek_score=0;
  assert.equal((await readProductionRankings(zero,"current","season","private-0")).gameweek[0].score,0);
  zero.touchline_fantasy_user_gameweek_scores=[];
  assert.equal((await readProductionRankings(zero,"current","season","private-0")).gameweek.length,0,"no score row is not a fabricated confirmed zero");
});
