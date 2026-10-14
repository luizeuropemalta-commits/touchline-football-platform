import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("actual ranking loader includes paid points only, even after a Beta user upgrades", async () => {
  const source = readFileSync(new URL("../lib/touchlineFantasy/server.ts", import.meta.url),"utf8");
  const body = source.slice(source.indexOf("async function loadRankings("),source.indexOf("async function loadCoaches("));
  const load = vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText + "\nloadRankings;",{
    rows:(data:unknown)=>Array.isArray(data)?data:[],text:(v:unknown)=>typeof v === "string" ? v:null,
    number:(v:unknown)=>typeof v === "number" ? v:null,
    rankTouchlineFantasyManagers:(values:unknown)=>values,
  });
  const gameweeks = [
    {id:"practice",user_id:"upgraded",gameweek_id:"current",market_plan_key_snapshot:"beta"},
    {id:"paid",user_id:"upgraded",gameweek_id:"current",market_plan_key_snapshot:"standard"},
    {id:"vip",user_id:"vip-user",gameweek_id:"current",market_plan_key_snapshot:"vip"},
    {id:"unknown",user_id:"unknown-user",gameweek_id:"current",market_plan_key_snapshot:null},
  ];
  const scores = gameweeks.map(row=>({user_gameweek_id:row.id,gameweek_score:row.id === "paid" ? 15 : row.id === "vip" ? 20 : 999,settlement_status:"FINAL"}));
  const admin = {from(table:string){
    let data:Record<string,unknown>[] = table === "touchline_fantasy_user_gameweeks" ? gameweeks : table === "touchline_fantasy_user_gameweek_scores" ? scores : [];
    const chain = {
      select(){return chain;},
      in(column:string,values:unknown[]){data=data.filter(row=>values.includes(row[column]));return chain;},
      eq(){return chain;},
      then(resolve:(value:unknown)=>unknown){return Promise.resolve({data,error:null}).then(resolve);},
    };
    return chain;
  }};
  const result = await load(admin,"current","season","upgraded");
  for (const ranking of [result.gameweek,result.season]) {
    assert.deepEqual(JSON.parse(JSON.stringify(ranking)).map((row:{userId:string;score:number})=>[row.userId,row.score]),[["upgraded",15],["vip-user",20]]);
  }
});
