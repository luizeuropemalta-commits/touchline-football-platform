import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";
import {publicOwnerId} from "../lib/touchlineArena/clubowner-public-contract.ts";
import {projectPublicOwnerSearchPage,validatePublicOwnerSearch} from "../lib/touchlineArena/clubowner-public-search.ts";
import {projectClubOwnerStandingIndex,projectClubOwnerStandingViews} from "../lib/touchlineArena/club-owner-standings.ts";
const account="11111111-1111-4111-8111-111111111111",publicId="22222222-2222-4222-8222-222222222222";
const row={accountId:account,publicId,displayName:"Public name",followerCount:1,following:false,viewer:"member"};
const transpile=(file:string)=>ts.transpileModule(readFileSync(new URL(`../lib/touchlineArena/${file}.ts`,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(options:{missingAdmin?:boolean;rpcError?:boolean;empty?:boolean;configError?:boolean;rankError?:boolean}={}){
 const calls:Array<Record<string,unknown>>=[];const exports:Record<string,unknown>={};let sharedSignal:AbortSignal|undefined;
 const admin={rpc(name:string,args:unknown){calls.push({name,args});return{abortSignal:async(signal:AbortSignal)=>{sharedSignal=signal;return{data:options.empty?[]:[row],error:options.rpcError?{}:null};}};},from(table:string){calls.push({table});const chain={select(columns:string){assert.equal(columns,"season_id");return chain;},eq(key:string,value:string){calls.push({key,value});return chain;},single:async()=>({data:{season_id:"confirmed-season"},error:options.configError?{}:null}),abortSignal(signal:AbortSignal){assert.equal(signal,sharedSignal);return chain;}};return chain;}};
 runInNewContext(transpile("clubowner-public-search-server"),{exports,AbortSignal,require(name:string){
  if(name==="server-only")return{};if(name==="@/lib/supabase/admin")return{createAdminClient:()=>options.missingAdmin?null:admin};
  if(name==="./clubowner-public-contract")return{publicOwnerId};
  if(name==="./clubowner-public-search")return{projectPublicOwnerSearchPage,validatePublicOwnerSearch};
  if(name==="./club-owner-standings-server")return{readClubOwnerProfileStandingForSeason:async(db:unknown,season:string,id:string,signal:AbortSignal)=>{assert.equal(db,admin);assert.equal(id,account);assert.equal(season,"confirmed-season");assert.equal(signal,sharedSignal);return {rank:4,points:48.28};},readClubOwnerStandingIndexForSeason:async(db:unknown,season:string,signal:AbortSignal)=>{assert.equal(db,admin);assert.equal(signal,sharedSignal);calls.push({season});return options.rankError?null:[{accountId:account,rank:4}];}};
  throw new Error(name);
 }});
 return{profile:exports.readPublicOwnerStanding as(id:string)=>Promise<unknown>,read:exports.readPublicOwnerSearchPage as(q:string,c:string|null,v:string|null)=>Promise<unknown>,calls};
}
test("search adapter reads public candidates then current server-owned season/index under one deadline",async()=>{
 const f=fixture();const result=await f.read("",null,account);assert.deepEqual(JSON.parse(JSON.stringify(result)),{profiles:[{publicId,displayName:"Public name",followerCount:1,following:false,viewer:"member",rank:4,planKey:null}],nextCursor:null});
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])),{name:"touchline_people_directory_candidates",args:{p_viewer:account}});
 assert.ok(f.calls.some(c=>c.key==="competition_key"&&c.value==="england"));assert.ok(f.calls.some(c=>c.key==="status"&&c.value==="active"));assert.ok(f.calls.some(c=>c.season==="confirmed-season"));
});
test("known empty directory avoids private standings reads; upstream failure never becomes empty or rank0",async()=>{
 const empty=fixture({empty:true});assert.deepEqual(JSON.parse(JSON.stringify(await empty.read("",null,null))),{profiles:[],nextCursor:null});assert.equal(empty.calls.length,1);
 for(const option of [{missingAdmin:true},{rpcError:true},{configError:true},{rankError:true}])await assert.rejects(fixture(option).read("",null,null));
 const invalid=fixture();await assert.rejects(invalid.read("x",null,null));assert.equal(invalid.calls.length,0);
});
test("internal standings index uses identical FINAL-only arithmetic and enforces row budget before further reads",async()=>{
 for(const oversized of [false,true]){
 const exports:Record<string,unknown>={};const signals:AbortSignal[]=[];let calls=0;
 const admin={from(table:string){calls++;const query={select(){return query;},in(){return query;},eq(){return query;},order(){return query;},range(){return query;},abortSignal:async(signal:AbortSignal)=>{signals.push(signal);return {error:null,count:oversized?100001:table.endsWith("user_gameweeks")?1:0,data:table.endsWith("user_gameweeks")?[{id:"round",user_id:account,market_plan_key_snapshot:"vip",users:{full_name:"PRIVATE_NAME"},touchline_fantasy_user_gameweek_scores:{gameweek_score:7.02,settlement_status:"FINAL"}}]:[]};}};return query;}};
 runInNewContext(transpile("club-owner-standings-server"),{exports,require(name:string){if(name==="server-only")return{};if(name==="@/lib/supabase/admin")return{createAdminClient:()=>admin};return{projectClubOwnerStandingIndex,projectClubOwnerStandingViews};}});
 const signal=new AbortController().signal;const result=await (exports.readClubOwnerStandingIndexForSeason as(db:unknown,s:string,a:AbortSignal)=>Promise<unknown>)(admin,"season",signal);
 assert.deepEqual(result,oversized?null:[{accountId:account,rank:1}]);assert.equal(calls,oversized?1:2);assert.ok(signals.every(s=>s===signal));assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NAME/);
 const readProfile=exports.readClubOwnerProfileStandingForSeason as(db:unknown,s:string,id:string,a:AbortSignal)=>Promise<unknown>;
 if(oversized) await assert.rejects(readProfile(admin,"season",account,signal));
 else {
  assert.deepEqual(JSON.parse(JSON.stringify(await readProfile(admin,"season",account,signal))),{rank:1,points:7.02});
  assert.equal(await readProfile(admin,"season",publicId,signal),null);
 }
 }
});

test("server search resolves name fragments only, never the same profile by its public or private ID",async()=>{
 const byName=fixture();assert.equal((await byName.read("name pub",null,account) as {profiles:unknown[]}).profiles.length,1);
 for(const query of [publicId,account])assert.deepEqual(JSON.parse(JSON.stringify(await fixture().read(query,null,account))),{profiles:[],nextCursor:null});
});

test("profile standing joins public identity to canonical account without exposing private descriptors",async()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(await fixture().profile(publicId))),{rank:4,points:48.28});
 for(const f of [fixture({empty:true}),fixture({rpcError:true}),fixture({configError:true})]) await assert.rejects(f.profile(publicId));
 await assert.rejects(fixture().profile(account));
});
