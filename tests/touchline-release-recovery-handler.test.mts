import test from "node:test";
import assert from "node:assert/strict";
import { handleClubReleaseRecovery } from "../lib/touchlineFantasy/club-release-recovery-handler.ts";
const id=(n:number)=>`30000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const reference={expectedAccountId:id(1),expectedSeasonId:id(2),schemaVersion:1,createdAt:1,action:"release",playerId:id(3),expectedRevision:4,idempotencyKey:"recovery_original_key"};
function fixture(owner:string|null=id(1),season:string|null=id(2)) {
  const calls:string[]=[];
  const deps={authenticate:async()=>{calls.push("auth");return owner;},currentSeason:async()=>{calls.push("season");return season;},read:async(actual:string,ref:typeof reference)=>{calls.push("read");assert.equal(actual,id(1));assert.deepEqual(ref,reference);return {status:"not_observed",resolved:false};}};
  return {calls,deps};
}
const request=(headers:Record<string,string>={},method="GET")=>new Request("https://qa.example/api/recovery",{method,headers:{"X-Touchline-Release-Reference":JSON.stringify(reference),...headers}});
test("authenticated recovery binds owner and independently resolved season and does not cache",async()=>{
  const f=fixture();const response=await handleClubReleaseRecovery(request(),f.deps);
  assert.equal(response.status,200);assert.deepEqual(f.calls,["auth","season","read"]);assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.deepEqual(await response.json(),{ok:true,result:{status:"not_observed",resolved:false}});
});
test("missing identity or another owner/season cannot reach the privileged repository",async()=>{
  for(const [owner,season,status,calls] of [[null,id(2),401,["auth"]],[id(9),id(2),409,["auth"]],[id(1),id(9),409,["auth","season"]],[id(1),null,503,["auth","season"]]] as const) {
    const f=fixture(owner,season);const response=await handleClubReleaseRecovery(request(),f.deps);
    assert.equal(response.status,status);assert.deepEqual(f.calls,calls);
  }
});
test("cross-site, writes and malformed references fail before authentication",async()=>{
  for(const req of [request({origin:"https://other.example"}),request({"sec-fetch-site":"cross-site"}),request({},"POST"),request({"X-Touchline-Release-Reference":"{}"}),request({"X-Touchline-Release-Reference":"x".repeat(2049)})]) {
    const f=fixture();const response=await handleClubReleaseRecovery(req,f.deps);assert.ok(response.status>=400);assert.deepEqual(f.calls,[]);
  }
});
test("abort during authentication prevents subsequent reads; errors remain generic",async()=>{
  const controller=new AbortController();const f=fixture();let resolve!:(value:string)=>void;
  const pending=handleClubReleaseRecovery(new Request(request(),{signal:controller.signal}),{...f.deps,authenticate:()=>new Promise(done=>{resolve=done;})});
  controller.abort();const response=await pending;assert.equal(response.status,503);resolve(id(1));await Promise.resolve();await Promise.resolve();assert.deepEqual(f.calls,[]);
  const failed=await handleClubReleaseRecovery(request(),{...f.deps,authenticate:async()=>{throw new Error("private database details");}});
  assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(await failed.json()),/private database/);
});
