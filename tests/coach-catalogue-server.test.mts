import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { resolveServerReadWithin } from "../lib/touchlineArena/server-read-deadline.ts";

const code=ts.transpileModule(readFileSync(new URL("../lib/touchlineArena/coach-catalogue-server.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(env:Record<string,string>={},mode="error"){
  let admins=0;const calls:Array<{name:string;args:unknown}>=[];
  const admin={rpc(name:string,args?:unknown){
    calls.push({name,args});
    return {abortSignal(signal:AbortSignal){
      assert.ok(signal instanceof AbortSignal);
      return mode==="reject" ? Promise.reject(new Error("SECRET")) : mode==="timeout" ? new Promise(()=>{})
        : Promise.resolve({data:mode==="staged"?1:null,error:mode==="staged"?null:{code:"missing"}});
    }};
  }};
  const exports:Record<string,unknown>={};runInNewContext(code,{exports,process:{env},AbortSignal,require(name:string){
    if(name==="server-only")return {};if(name==="react")return {cache:(fn:unknown)=>fn};
    if(name==="@/lib/supabase/admin")return {createAdminClient:()=>{admins++;return admin;}};
    if(name==="./coach-catalogue-contract.ts")return contract;
    if(name==="./server-read-deadline.ts")return {resolveServerReadWithin:(read:PromiseLike<unknown>,fallback:unknown,timeout:number)=>{assert.equal(timeout,8000);return resolveServerReadWithin(read,fallback,5);}};
    throw new Error(`Unexpected ${name}`);
  }});
  return {admin,calls,admins:()=>admins,read:exports.loadCoachCatalogue as ()=>Promise<contract.CoachCatalogue>,stage:exports.stageObservedCoachFixture as (admin:unknown,id:string)=>Promise<string|null>};
}
test("coach public/editorial gates default OFF execute zero DB/provider work",async()=>{
  const f=fixture();assert.deepEqual(await f.read(),contract.legacyCoachCatalogue());assert.equal(await f.stage(f.admin,"123"),null);assert.equal(f.admins(),0);assert.deepEqual(f.calls,[]);
});
for(const mode of ["error","reject","timeout"])test(`enabled coach reader ${mode} is bounded and fails closed without seed fallback`,async()=>{
  const f=fixture({TOUCHLINE_COACH_CATALOGUE_ENABLED:"true"},mode),result=await f.read();assert.equal(result.phase,"unavailable");assert.deepEqual(result.current,[]);assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,"touchline_read_coach_catalogue");
});
test("coach detection submits only persisted fixture ID, reports failure and never calls a provider",async()=>{
  const f=fixture({TOUCHLINE_COACH_EDITORIAL_ENABLED:"true"},"staged");assert.equal(await f.stage(f.admin,"123"),null);assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{name:"touchline_stage_coach_fixture",args:{p_fixture_id:"123"}}]);
  const rejected=fixture({TOUCHLINE_COACH_EDITORIAL_ENABLED:"true"},"reject");assert.equal(await rejected.stage(rejected.admin,"123"),"coach-editorial:staging-unavailable");
  const failed=fixture({TOUCHLINE_COACH_EDITORIAL_ENABLED:"true"},"error");assert.equal(await failed.stage(failed.admin,"123"),"coach-editorial:staging-unconfirmed");
});
