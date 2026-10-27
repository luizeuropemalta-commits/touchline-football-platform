import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as acquisition from "../lib/touchlineFantasy/club-acquisition.ts";
import {parseClubInitialBudget} from "../lib/touchlineFantasy/club-initial-budget.ts";

const source=readFileSync(new URL("../lib/touchlineFantasy/club-initial-budget-server.ts",import.meta.url),"utf8");
const tables=["touchline_fantasy_entitlements","touchline_card_contracts","touchline_coach_contracts","touchline_fantasy_user_gameweek_selections"];
async function read(overrides:Record<string,unknown>={}){
  const calls:string[]=[];
  const results:Record<string,unknown>={
    [tables[0]]:{data:{plan_key:"vip",current_period_start:null,current_period_end:null},error:null},
    ...Object.fromEntries(tables.slice(1).map(table=>[table,{data:[],error:null}])),...overrides,
  };
  const admin={from(table:string){assert.ok(tables.includes(table));calls.push(table);
    const query={select:(columns:string)=>{calls.push(columns);return query;},eq:(key:string,value:string)=>{calls.push(`${key}=${value}`);return query;},
      or:(value:string)=>{calls.push(value);return query;},limit:()=>query,maybeSingle:()=>Promise.resolve(results[table]),
      then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(results[table]).then(resolve)};return query;}};
  const exports={} as {readClubInitialBudget:(admin:unknown,owner:string,season:string)=>Promise<unknown>};
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,Date,Error,require:(name:string)=>{if(name==="server-only")return {};if(name.includes("club-acquisition"))return acquisition;throw new Error(name);}});
  const value=await exports.readClubInitialBudget(admin,"owner","season");
  return {value:value?JSON.parse(JSON.stringify(value)):null,calls};
}
test("pristine approved accounts expose the canonical allowance without creating a collection",async()=>{
  for(const plan of ["beta","standard","master","vip"] as const){
    const {value,calls}=await read({[tables[0]]:{data:{plan_key:plan,current_period_start:null,current_period_end:null},error:null}});
    assert.deepEqual(value,{plan,balanceEur:acquisition.CLUB_ACQUISITION_BUDGETS[plan]});
    assert.ok(calls.includes("season_id.eq.season,season_id.is.null"));
    assert.ok(calls.includes("touchline_fantasy_user_gameweeks.user_id=owner"));
    assert.ok(calls.includes("touchline_fantasy_user_gameweeks.touchline_fantasy_gameweeks.season_id=season"));
  }
  assert.doesNotMatch(source,/\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
});
test("each legacy artifact suppresses initial allowance and any read failure fails closed",async()=>{
  for(const table of tables.slice(1))assert.equal((await read({[table]:{data:[{}],error:null}})).value,null);
  for(const table of tables)await assert.rejects(read({[table]:{data:null,error:{message:"offline"}}}),/CLUB_BUDGET_UNCONFIRMED/);
  await assert.rejects(read({[tables[3]]:{data:null,error:null}}),/CLUB_BUDGET_UNCONFIRMED/);
});
test("expired, future, unsupported and malformed entitlements do not unlock initial budget",async()=>{
  const base={plan_key:"vip",current_period_start:null,current_period_end:null};
  for(const data of [null,{...base,plan_key:"pro"},{...base,current_period_end:"2000-01-01"},
    {...base,current_period_start:"2999-01-01"},{...base,current_period_end:"invalid"},{plan_key:"vip"}]){
    assert.equal((await read({[tables[0]]:{data,error:null}})).value,null);
  }
  assert.equal(parseClubInitialBudget({plan:"vip",balanceEur:1_000_000_000}),null);
  assert.equal(parseClubInitialBudget({plan:"vip",balanceEur:1_200_000_000}),null);
  assert.deepEqual(parseClubInitialBudget({plan:"vip",balanceEur:3_000_000_000}),{plan:"vip",balanceEur:3_000_000_000});
});

test("new Beta initial allowance rejects old 50M and accepts only canonical100M",()=>{assert.equal(parseClubInitialBudget({plan:"beta",balanceEur:50_000_000}),null);assert.deepEqual(parseClubInitialBudget({plan:"beta",balanceEur:100_000_000}),{plan:"beta",balanceEur:100_000_000});});
